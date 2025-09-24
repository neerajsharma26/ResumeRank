
'use server';

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  getDoc,
  increment,
  collectionGroup,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { Batch, BatchStatus, ResumeV2, BatchDoc, ResumeDoc } from '@/lib/types';
import { processResumeV2 } from '@/ai/flows/process-resume-v2';
import { v4 as uuidv4 } from 'uuid';

// Environment variables / constants
const RUN_TIMEOUT_SEC = 90;
const MAX_RETRIES = 3;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'default-bucket';

async function getFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function createBatch(
  userId: string,
  jobDescription: string,
  files: { filename: string; data: ArrayBuffer, originalFile: File }[]
): Promise<string> {
  const batchId = uuidv4();
  const batchRef = doc(db, 'batches', batchId);
  const resumesRef = collection(batchRef, 'resumes');
  const firestoreBatch = writeBatch(db);

  try {
    let skippedDuplicates = 0;
    const processedHashes = new Set<string>();

    const newBatchData: Omit<BatchDoc, 'id' | 'createdAt' | 'updatedAt'> = {
      batchId,
      userId,
      status: 'running',
      jobDescription,
      total: files.length,
      completed: 0,
      failed: 0,
      cancelledCount: 0,
      skippedDuplicates: 0,
    };

    firestoreBatch.set(batchRef, {
      ...newBatchData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const file of files) {
      const fileHash = await getFileHash(file.originalFile);
      if (processedHashes.has(fileHash)) {
          skippedDuplicates++;
          continue;
      }
      processedHashes.add(fileHash);

      const resumeId = uuidv4();
      const storagePath = `resumes_v2/${batchId}/${resumeId}_${file.filename}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file.data);

      const bucket = storage.app.options.storageBucket || STORAGE_BUCKET;
      const fileUrl = `gs://${bucket}/${storagePath}`;

      const newResumeData: Omit<ResumeDoc, 'id' | 'lastUpdatedAt'> = {
        resumeId,
        batchId,
        fileUrl,
        fileHash,
        status: 'pending',
        startTime: null,
        workerId: null,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        result: null,
        error: null,
      };

      firestoreBatch.set(doc(resumesRef, resumeId), {
        ...newResumeData,
        lastUpdatedAt: serverTimestamp(),
      });
    }
    
    firestoreBatch.update(batchRef, { skippedDuplicates });

    await firestoreBatch.commit();
    
    // Kick off the first processing job asynchronously.
    process.nextTick(() => processSingleResume(batchId));

    return batchId;
  } catch (error: any) {
      console.error("Error creating batch:", error);
      // In a real app, you'd want to handle this more gracefully,
      // maybe by cleaning up the created batch document or marking it as failed.
      throw new Error(`Failed to create batch: ${error.message}`);
  }
}

export async function processSingleResume(batchId: string): Promise<void> {
  const workerId = uuidv4();
  let claimedResumeRef: any | null = null;
  let claimedResumeData: ResumeDoc | null = null;

  try {
    // 1. Check batch status before claiming
    const batchRef = doc(db, 'batches', batchId);
    const batchSnap = await getDoc(batchRef);
    if (!batchSnap.exists()) {
      console.log(`Batch ${batchId} does not exist. Worker ${workerId} stopping.`);
      return;
    }
    const batchData = batchSnap.data() as BatchDoc;
    if (batchData.status === 'paused' || batchData.status === 'cancelled') {
      console.log(`Batch ${batchId} is ${batchData.status}. Worker ${workerId} stopping.`);
      return;
    }

    // 2. Atomically claim a pending resume
    await runTransaction(db, async (transaction) => {
      const q = query(
        collection(db, 'batches', batchId, 'resumes'),
        where('status', '==', 'pending'),
        orderBy('lastUpdatedAt'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // No pending resumes left. Stop the loop.
        return;
      }

      const resumeDoc = querySnapshot.docs[0];
      claimedResumeRef = resumeDoc.ref;
      
      const data = resumeDoc.data() as ResumeDoc;
      if (data.status !== 'pending') {
        // Another worker claimed it.
        claimedResumeRef = null;
        return;
      }

      transaction.update(claimedResumeRef, {
        status: 'running',
        workerId: workerId,
        startTime: Timestamp.now(),
        lastUpdatedAt: Timestamp.now(),
      });
      
      claimedResumeData = { id: resumeDoc.id, ...data } as ResumeDoc;
    });

    if (!claimedResumeRef || !claimedResumeData) {
      // Check if the batch is complete
      const totalProcessed = (batchData.completed || 0) + (batchData.failed || 0) + (batchData.cancelledCount || 0) + (batchData.skippedDuplicates || 0);
      if (totalProcessed >= batchData.total) {
          await updateDoc(batchRef, { status: 'complete', updatedAt: serverTimestamp() });
          console.log(`Batch ${batchId} completed.`);
      }
      return;
    }

    // 3. Re-check batch status after claim (important for pause/cancel)
    const freshBatchSnap = await getDoc(batchRef);
    const freshBatchData = freshBatchSnap.data() as BatchDoc;
    if (freshBatchData.status !== 'running') {
        await updateDoc(claimedResumeRef, { status: 'pending', workerId: null, startTime: null, lastUpdatedAt: serverTimestamp() });
        console.log(`Batch ${batchId} status changed after claim. Re-queueing resume. Worker ${workerId} stopping.`);
        // Don't requeue the whole loop, just stop this worker instance.
        return;
    }

    // 4. Process the claimed resume
    try {
      const { fileUrl } = claimedResumeData;
      const jobDescription = freshBatchData.jobDescription || '';

      // Single Gemini call
      const result = await processResumeV2({ resumePdfUrl: fileUrl, jobDescription });

      // 6. On success
      await updateDoc(claimedResumeRef, {
        status: 'complete',
        result: {
            json: result,
            description: result.description,
            scores: result.scores,
            schemaVersion: 2,
            modelVersion: 'gemini-1.5-flash',
        },
        lastUpdatedAt: Timestamp.now(),
        error: null,
      });

      await updateDoc(batchRef, {
          completed: increment(1),
          updatedAt: serverTimestamp()
      });

    } catch (e: any) {
      console.error(`Error processing resume ${claimedResumeRef.id} in batch ${batchId}:`, e);
      
      let errorCode = 'transient_error';
      if (e.message?.includes('429')) errorCode = 'transient.rate_limited_429';
      if (e.message?.includes('5xx') || e.message?.includes('503')) errorCode = 'transient.server_5xx';
      if (e.message?.includes('timed out')) errorCode = 'transient.network_timeout';
      if (e.message?.includes('ZodError')) errorCode = 'permanent.schema_mismatch';


      const isPermanent = errorCode.startsWith('permanent');
      const currentRetryCount = claimedResumeData.retryCount || 0;

      if (!isPermanent && currentRetryCount < MAX_RETRIES) {
        // 7. On transient error
        await updateDoc(claimedResumeRef, {
          status: 'pending',
          retryCount: increment(1),
          workerId: null,
          startTime: null,
          lastUpdatedAt: Timestamp.now(),
          error: { code: errorCode, message: e.message || 'Unknown processing error' },
        });
      } else {
        // 8. On permanent error or max retries reached
        await updateDoc(claimedResumeRef, {
          status: 'failed',
          workerId: null,
          startTime: null,
          lastUpdatedAt: Timestamp.now(),
          error: { code: 'permanent_failure', message: `Max retries (${MAX_RETRIES}) reached. Last error: ${e.message || 'Unknown'}` },
        });
        await updateDoc(batchRef, {
          failed: increment(1),
          updatedAt: serverTimestamp()
        });
      }
    }

  } catch (error) {
    console.error(`Transaction or claim process failed for worker ${workerId}:`, error);
  }

  // 10. Loop: After processing, unconditionally trigger the next iteration.
  // This will handle the next pending item or gracefully exit if none are left.
  process.nextTick(() => processSingleResume(batchId));
}

export async function controlBatch(userId: string, batchId: string, action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    const batchRef = doc(db, 'batches', batchId);

    await runTransaction(db, async (transaction) => {
        const batchDoc = await transaction.get(batchRef);
        if (!batchDoc.exists() || batchDoc.data().userId !== userId) {
            throw new Error('Permission denied or batch not found.');
        }

        const currentStatus = batchDoc.data().status;
        let newStatus: BatchStatus;
        switch (action) {
            case 'pause':
                if (currentStatus === 'running') newStatus = 'paused';
                else return; // Can only pause a running batch
                break;
            case 'resume':
                if (currentStatus === 'paused') newStatus = 'running';
                else return; // Can only resume a paused batch
                break;
            case 'cancel':
                if (currentStatus === 'running' || currentStatus === 'paused') newStatus = 'cancelled';
                else return; // Can only cancel running or paused batches
                break;
        }

        transaction.update(batchRef, { status: newStatus, updatedAt: serverTimestamp() });

        if (action === 'cancel') {
            const resumesRef = collection(batchRef, 'resumes');
            const q = query(resumesRef, where('status', 'in', ['pending', 'paused']));
            const resumesToCancelSnapshot = await getDocs(q);
            let cancelledCount = 0;
            resumesToCancelSnapshot.forEach(resumeDoc => {
                transaction.update(resumeDoc.ref, { status: 'cancelled' });
                cancelledCount++;
            });
            transaction.update(batchRef, { cancelledCount: increment(cancelledCount) });
        }
    });

    if (action === 'resume') {
        // Kick off a worker to resume processing
        process.nextTick(() => processSingleResume(batchId));
    }
}

// Watchdog function to be run on a schedule (e.g., via Cloud Scheduler)
export async function watchdog() {
    const timeoutThreshold = Timestamp.fromMillis(Date.now() - RUN_TIMEOUT_SEC * 1000);
    
    // NOTE: This will require a composite index on (status, startTime) in Firestore.
    // The index can be created in the Firebase console.
    const q = query(
        collectionGroup(db, 'resumes'),
        where('status', '==', 'running'),
        where('startTime', '<', timeoutThreshold)
    );

    const querySnapshot = await getDocs(q);
    console.log(`Watchdog found ${querySnapshot.size} potentially stuck jobs.`);

    for (const resumeDoc of querySnapshot.docs) {
        const resume = resumeDoc.data() as ResumeDoc;
        const resumeRef = resumeDoc.ref;
        const batchRef = doc(db, 'batches', resume.batchId);

        try {
            const currentRetryCount = resume.retryCount || 0;
            if (currentRetryCount < (resume.maxRetries ?? MAX_RETRIES)) {
                await updateDoc(resumeRef, {
                    status: 'pending', // Re-queue
                    retryCount: increment(1),
                    workerId: null,
                    startTime: null,
                    lastUpdatedAt: serverTimestamp(),
                    error: { code: 'timeout_watchdog', message: `Job timed out after ${RUN_TIMEOUT_SEC} seconds. Re-queued by watchdog.` }
                });
                console.log(`Re-queued job ${resumeDoc.id} from batch ${resume.batchId}.`);
            } else {
                await updateDoc(resumeRef, {
                    status: 'failed',
                    lastUpdatedAt: serverTimestamp(),
                    error: { code: 'timeout_final', message: `Job failed after ${MAX_RETRIES + 1} attempts including timeouts.` }
                });
                await updateDoc(batchRef, { failed: increment(1), updatedAt: serverTimestamp() });
                console.log(`Failed job ${resumeDoc.id} from batch ${resume.batchId} due to repeated timeouts.`);
            }
        } catch (error) {
            console.error(`Watchdog failed to update job ${resumeDoc.id}:`, error);
        }
    }
}


export async function getBatches(userId: string): Promise<Batch[]> {
    if (!userId) {
        throw new Error('User not authenticated');
    }
    const batchesRef = collection(db, 'batches');
    const q = query(batchesRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Convert Firestore Timestamps to ISO strings for serialization
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
        const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString();

        return {
            id: doc.id,
            ...data,
            createdAt,
            updatedAt,
        } as Batch;
    });
}
    
export async function getBatchDetails(userId: string, batchId: string): Promise<{ batch: Batch, resumes: ResumeV2[] } | null> {
    if (!userId || !batchId) {
        throw new Error('User or Batch ID not provided');
    }
    
    const batchRef = doc(db, 'batches', batchId);
    const batchSnap = await getDoc(batchRef);

    if (!batchSnap.exists() || batchSnap.data().userId !== userId) {
        console.error('Permission denied or batch not found for getBatchDetails.');
        return null;
    }

    const batchData = batchSnap.data();
    const batch = {
        id: batchSnap.id,
        ...batchData,
        createdAt: batchData.createdAt.toDate().toISOString(),
        updatedAt: batchData.updatedAt.toDate().toISOString(),
    } as Batch;


    const resumesRef = collection(db, 'batches', batchId, 'resumes');
    const q = query(resumesRef, orderBy('lastUpdatedAt', 'desc'));
    const resumesSnapshot = await getDocs(q);
    
    const resumes = resumesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            startTime: data.startTime ? data.startTime.toDate().toISOString() : null,
            lastUpdatedAt: data.lastUpdatedAt.toDate().toISOString(),
        } as ResumeV2;
    });

    return { batch, resumes };
}
