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
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { Batch, BatchStatus, ResumeV2, ResumeV2Status } from '@/lib/types';
import { processResumeV2 } from '@/ai/flows/process-resume-v2';
import { v4 as uuidv4 } from 'uuid';

// Environment variables / constants
const RUN_TIMEOUT_SEC = 90;
const MAX_RETRIES = 3;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'resumerank-8lirw.appspot.com';

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

  let skippedDuplicates = 0;
  const processedHashes = new Set<string>();

  const newBatchData: Omit<Batch, 'updatedAt' | 'createdAt'> = {
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

    const fileUrl = `gs://${STORAGE_BUCKET}/${storagePath}`;

    const newResumeData: Omit<ResumeV2, 'lastUpdatedAt'> = {
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
  processSingleResume(batchId);

  return batchId;
}

export async function processSingleResume(batchId: string): Promise<void> {
  const workerId = uuidv4();
  let claimedResume: (ResumeV2 & { id: string }) | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      const batchDoc = await transaction.get(doc(db, 'batches', batchId));
      if (!batchDoc.exists() || batchDoc.data().status !== 'running') {
        // Batch is paused, cancelled, or complete. Stop processing.
        console.log(`Batch ${batchId} is not in 'running' state. Worker ${workerId} stopping.`);
        return;
      }

      const q = query(
        collection(db, 'batches', batchId, 'resumes'),
        where('status', '==', 'pending'),
        orderBy('lastUpdatedAt'), // Using lastUpdatedAt to roughly approximate FIFO
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // No pending resumes left.
        return;
      }

      const resumeDoc = querySnapshot.docs[0];
      const resumeRef = resumeDoc.ref;

      // Atomically claim the job
      transaction.update(resumeRef, {
        status: 'running',
        workerId: workerId,
        startTime: Timestamp.now(),
        lastUpdatedAt: Timestamp.now(),
      });
      
      claimedResume = { id: resumeDoc.id, ...(resumeDoc.data() as ResumeV2) };
    });

    if (claimedResume) {
      const { id: resumeId, fileUrl } = claimedResume;
      const resumeRef = doc(db, 'batches', batchId, 'resumes', resumeId);
      const batchRef = doc(db, 'batches', batchId);

      try {
        const batchDoc = await getDoc(batchRef);
        const jobDescription = batchDoc.data()?.jobDescription || '';

        // Single Gemini call
        const result = await processResumeV2({ resumePdfUrl: fileUrl, jobDescription });

        await updateDoc(resumeRef, {
          status: 'complete',
          'result.json': result,
          'result.description': result.description,
          'result.scores': result.scores,
          'result.schemaVersion': 2,
          'result.modelVersion': 'gemini-1.5-flash',
          lastUpdatedAt: Timestamp.now(),
          error: null,
        });

        await updateDoc(batchRef, {
            completed: increment(1),
            updatedAt: serverTimestamp()
        });

      } catch (e: any) {
        console.error(`Error processing resume ${resumeId} in batch ${batchId}:`, e);
        const currentDoc = await getDoc(resumeRef);
        const currentData = currentDoc.data() as ResumeV2;
        
        let errorCode = 'transient_error';
        if (e.message?.includes('429')) errorCode = 'transient.rate_limited_429';
        if (e.message?.includes('5xx')) errorCode = 'transient.server_5xx';


        if (currentData.retryCount < MAX_RETRIES) {
          // Requeue for retry with backoff
          await updateDoc(resumeRef, {
            status: 'pending',
            retryCount: increment(1),
            workerId: null,
            startTime: null,
            lastUpdatedAt: Timestamp.now(),
            error: { code: errorCode, message: e.message || 'Unknown processing error' },
          });
        } else {
          // Max retries reached, mark as failed
          await updateDoc(resumeRef, {
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
    }
  } catch (error) {
    console.error(`Transaction failed for worker ${workerId}:`, error);
  }

  // After processing (or if no resume was claimed), check if we should continue
  const finalBatchDoc = await getDoc(doc(db, 'batches', batchId));
  if (!finalBatchDoc.exists()) return;

  const batchData = finalBatchDoc.data() as Batch;

  if(batchData.status === 'running') {
      const totalProcessed = batchData.completed + batchData.failed + batchData.cancelledCount + batchData.skippedDuplicates;
      if (totalProcessed >= batchData.total) {
          await updateDoc(finalBatchDoc.ref, { status: 'complete', updatedAt: serverTimestamp() });
          console.log(`Batch ${batchId} completed.`);
      } else {
          // Self-re-invoke to process the next item in the queue.
          process.nextTick(() => processSingleResume(batchId));
      }
  }
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
    
    // This query is inefficient as it requires a composite index on (status, startTime).
    // A better approach for a large-scale system is to query batches and then subcollections,
    // but for this implementation, we'll assume a root-level `resumes` collection for querying is acceptable.
    // NOTE: This will require a composite index on (status, startTime) in Firestore.
    const q = query(
        collection(db, 'resumes'),
        where('status', '==', 'running'),
        where('startTime', '<', timeoutThreshold)
    );

    const querySnapshot = await getDocs(q);
    console.log(`Watchdog found ${querySnapshot.size} potentially stuck jobs.`);

    for (const resumeDoc of querySnapshot.docs) {
        const resume = resumeDoc.data() as ResumeV2;
        const resumeRef = resumeDoc.ref;
        const batchRef = doc(db, 'batches', resume.batchId);

        if (resume.retryCount < MAX_RETRIES) {
            await updateDoc(resumeRef, {
                status: 'pending', // Re-queue
                retryCount: increment(1),
                workerId: null,
                startTime: null,
                lastUpdatedAt: serverTimestamp(),
                error: { code: 'timeout', message: `Job timed out after ${RUN_TIMEOUT_SEC} seconds. Re-queued by watchdog.` }
            });
             console.log(`Re-queued job ${resumeDoc.id} from batch ${resume.batchId}.`);
        } else {
            await updateDoc(resumeRef, {
                status: 'failed',
                lastUpdatedAt: serverTimestamp(),
                error: { code: 'timeout_final', message: `Job failed after ${MAX_RETRIES + 1} attempts including timeouts.` }
            });
            await updateDoc(batchRef, { failed: increment(1) });
            console.log(`Failed job ${resumeDoc.id} from batch ${resume.batchId} due to repeated timeouts.`);
        }
    }
}
