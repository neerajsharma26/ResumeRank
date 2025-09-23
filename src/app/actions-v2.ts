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

  const now = new Date();
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
  
  // Kick off the first processing job async
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
        orderBy('lastUpdatedAt'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // No pending resumes left.
        console.log(`No pending resumes in batch ${batchId}. Worker ${workerId} stopping.`);
        return;
      }

      const resumeDoc = querySnapshot.docs[0];
      const resumeRef = resumeDoc.ref;

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

        const result = await processResumeV2({ resumePdfUrl: fileUrl, jobDescription });

        await updateDoc(resumeRef, {
          status: 'complete',
          'result.json': result,
          'result.description': result.description,
          'result.scores': result.scores,
          'result.schemaVersion': 1,
          'result.modelVersion': 'gemini-1.5-flash',
          lastUpdatedAt: Timestamp.now(),
          error: null,
        });

        await updateDoc(batchRef, {
            completed: increment(1),
            updatedAt: Timestamp.now()
        });

      } catch (e: any) {
        console.error(`Error processing resume ${resumeId} in batch ${batchId}:`, e);
        const currentDoc = await getDoc(resumeRef);
        const currentData = currentDoc.data() as ResumeV2;

        if (currentData.retryCount < MAX_RETRIES) {
          // Requeue for retry with backoff
          await updateDoc(resumeRef, {
            status: 'pending',
            retryCount: increment(1),
            workerId: null,
            startTime: null,
            lastUpdatedAt: Timestamp.now(),
            'error.code': 'transient_error',
            'error.message': e.message || 'Unknown processing error',
          });
        } else {
          // Max retries reached, mark as failed
          await updateDoc(resumeRef, {
            status: 'failed',
            workerId: null,
            startTime: null,
            lastUpdatedAt: Timestamp.now(),
            'error.code': 'permanent_failure',
            'error.message': `Max retries (${MAX_RETRIES}) reached. Last error: ${e.message || 'Unknown'}`,
          });
          await updateDoc(batchRef, {
            failed: increment(1),
            updatedAt: Timestamp.now()
          });
        }
      }
    }
  } catch (error) {
    console.error(`Transaction failed for worker ${workerId}:`, error);
  }

  // After processing (or if no resume was claimed), check if we should continue
  const finalBatchDoc = await getDoc(doc(db, 'batches', batchId));
  const batchData = finalBatchDoc.data() as Batch;
  if(batchData.status === 'running') {
      const totalProcessed = batchData.completed + batchData.failed + batchData.cancelledCount + batchData.skippedDuplicates;
      if (totalProcessed >= batchData.total) {
          await updateDoc(finalBatchDoc.ref, { status: 'complete', updatedAt: Timestamp.now() });
          console.log(`Batch ${batchId} completed.`);
      } else {
          // Self-re-invoke to process the next item
          processSingleResume(batchId);
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

        let newStatus: BatchStatus;
        switch (action) {
            case 'pause':
                newStatus = 'paused';
                break;
            case 'resume':
                newStatus = 'running';
                break;
            case 'cancel':
                newStatus = 'cancelled';
                break;
        }

        transaction.update(batchRef, { status: newStatus, updatedAt: Timestamp.now() });

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
        processSingleResume(batchId);
    }
}

// Watchdog function to be run on a schedule (e.g., via Cloud Scheduler)
export async function watchdog() {
    const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - RUN_TIMEOUT_SEC * 1000);
    const q = query(
        collection(db, 'resumes'), // This assumes a root collection for resumes for querying.
                                    // For subcollections, you'd need to iterate through batches.
        where('status', '==', 'running'),
        where('startTime', '<', fiveMinutesAgo)
    );

    const querySnapshot = await getDocs(q);
    console.log(`Watchdog found ${querySnapshot.size} potentially stuck jobs.`);

    for (const resumeDoc of querySnapshot.docs) {
        const resume = resumeDoc.data() as ResumeV2;
        const resumeRef = resumeDoc.ref;

        if (resume.retryCount < MAX_RETRIES) {
            await updateDoc(resumeRef, {
                status: 'pending',
                retryCount: increment(1),
                workerId: null,
                startTime: null,
                lastUpdatedAt: Timestamp.now(),
                'error.code': 'timeout',
                'error.message': `Job timed out after ${RUN_TIMEOUT_SEC} seconds. Re-queued by watchdog.`
            });
             console.log(`Re-queued job ${resumeDoc.id} from batch ${resume.batchId}.`);
        } else {
            await updateDoc(resumeRef, {
                status: 'failed',
                lastUpdatedAt: Timestamp.now(),
                'error.code': 'timeout_final',
                'error.message': `Job failed after ${MAX_RETRIES + 1} attempts including timeouts.`
            });
            await updateDoc(doc(db, 'batches', resume.batchId), { failed: increment(1) });
            console.log(`Failed job ${resumeDoc.id} from batch ${resume.batchId} due to repeated timeouts.`);
        }
    }
}
