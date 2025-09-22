
'use server';

import {
  rankResumes as rankResumesFlow,
  RankResumesInput,
  RankResumesOutput,
} from '@/ai/flows/rank-resumes';
import {
  parseResumeSkills as parseResumeSkillsFlow,
  ParseResumeSkillsInput,
  ParseResumeSkillsOutput,
} from '@/ai/flows/parse-resume-skills';
import {
  matchKeywordsToResume as matchKeywordsToResumeFlow,
  MatchKeywordsToResumeInput,
  MatchKeywordsToResumeOutput,
} from '@/ai/flows/match-keywords-to-resume';
import {db, storage} from '@/lib/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  updateDoc,
  writeBatch,
  getDoc,
  deleteDoc,
  arrayUnion,
  setDoc,
} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL, deleteObject, listAll} from 'firebase/storage';

import type {
  Resume,
  MetricWeights,
  CandidateStatus,
  AnalysisDetails,
} from '@/lib/types';
import type { Report } from '@/app/page';

export type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
  Report
};

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (e.message?.includes('429') || e.message?.includes('503')) {
         if (i < 4) { 
          const delay = 2000 * Math.pow(2, i);
          console.log(`Attempt ${i + 1} failed with ${e.message}. Retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
        }
      } else {
        throw e;
      }
    }
  }
  throw lastError;
}


export async function analyzeResumesAction(
  jobDescription: string,
  resumes: Resume[],
  weights: MetricWeights,
  userId: string,
  files: {filename: string; data: ArrayBuffer}[]
): Promise<ReadableStream<any>> {
    const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        if (!jobDescription.trim()) {
            throw new Error('Job description cannot be empty.');
        }
        if (resumes.length === 0) {
            throw new Error('Please select at least one resume to analyze.');
        }

        enqueue({ type: 'status', message: 'Creating analysis report...' });

        const initialReportData = {
            jobDescription,
            rankedResumes: [],
            statuses: {},
            createdAt: serverTimestamp(),
            resumes: resumes.map(r => ({ filename: r.filename, url: '' }))
        };

        const reportRef = await addDoc(collection(db, 'users', userId, 'analysisReports'), initialReportData);
        enqueue({ type: 'reportId', id: reportRef.id });


        enqueue({ type: 'status', message: 'Uploading resume files...' });
        const uploadPromises = files.map(async file => {
            const storageRef = ref(storage, `resumehire/${userId}/${reportRef.id}/${file.filename}`);
            await uploadBytes(storageRef, file.data);
            const downloadURL = await getDownloadURL(storageRef);
            return { filename: file.filename, url: downloadURL };
        });

        const uploadedFiles = await Promise.all(uploadPromises);
        const fileUrlMap = uploadedFiles.reduce((acc, file) => {
            acc[file.filename] = file.url;
            return acc;
        }, {} as Record<string, string>);

        const finalResumesWithUrls = resumes.map(r => ({
            filename: r.filename,
            url: fileUrlMap[r.filename] || ''
        }));

        await updateDoc(reportRef, { resumes: finalResumesWithUrls });
        enqueue({ type: 'resumes', resumes: finalResumesWithUrls });


        const batchSize = 4;
        let allDetails: AnalysisDetails = {};
        
        for (let i = 0; i < resumes.length; i += batchSize) {
            const batch = resumes.slice(i, i + batchSize);
            enqueue({ type: 'status', message: `Analyzing batch ${i / batchSize + 1} of ${Math.ceil(resumes.length / batchSize)}...` });

            const detailPromises = batch.map(async (resume) => {
                enqueue({ type: 'status', message: `Parsing skills for ${resume.filename}...` });
                const skillsPromise = retry(() => parseResumeSkillsFlow({ resumeText: resume.content }));
                
                enqueue({ type: 'status', message: `Matching keywords for ${resume.filename}...` });
                const keywordsPromise = retry(() => matchKeywordsToResumeFlow({ resumeText: resume.content, jobDescription }));
                
                const [skills, keywords] = await Promise.all([skillsPromise, keywordsPromise]);
                
                const detail = { skills, keywords };
                enqueue({ type: 'detail', filename: resume.filename, detail });
                
                return { filename: resume.filename, ...detail };
            });

            const detailsArray = await Promise.all(detailPromises);
            
            const batchDetails = detailsArray.reduce((acc, detail) => {
                acc[detail.filename] = { skills: detail.skills, keywords: detail.keywords };
                return acc;
            }, {} as AnalysisDetails);

            allDetails = { ...allDetails, ...batchDetails };
        }
        
        enqueue({ type: 'status', message: 'Saving analysis details...' });
        const detailsBatch = writeBatch(db);
        for (const [filename, detailData] of Object.entries(allDetails)) {
            const detailRef = doc(db, 'users', userId, 'analysisReports', reportRef.id, 'details', filename);
            detailsBatch.set(detailRef, detailData);
        }
        await detailsBatch.commit();
        
        enqueue({ type: 'status', message: 'Ranking candidates...' });
        
        const rankResumesInput: RankResumesInput = {
            resumes: resumes,
            jobDescription: jobDescription,
            weights: weights,
        };
        const rankedResumes = await retry(() => rankResumesFlow(rankResumesInput));
        const sortedRankedResumes = [...rankedResumes].sort((a, b) => b.score - a.score);
        
        const statuses = sortedRankedResumes.reduce((acc, r) => {
          acc[r.filename] = 'none';
          return acc;
        }, {} as Record<string, CandidateStatus>);
        
        await updateDoc(reportRef, { rankedResumes: sortedRankedResumes, statuses });
        
        enqueue({ type: 'status', message: 'Finalizing report...' });

        const finalDocSnapshot = await getDoc(reportRef);
        const finalDocData = finalDocSnapshot.data();

        const finalReport: Report = {
            id: reportRef.id,
            jobDescription,
            rankedResumes: sortedRankedResumes,
            resumes: finalResumesWithUrls,
            details: allDetails,
            statuses,
            createdAt: (finalDocData?.createdAt?.toDate() ?? new Date()).toISOString(),
        };

        enqueue({ type: 'done', report: finalReport });
        controller.close();

      } catch (e: any) {
        console.error('Error in analyzeResumesAction stream:', e);
        enqueue({ type: 'error', error: e.message || 'An unexpected error occurred during analysis.' });
        controller.close();
      }
    }
  });

  return stream;
}

export async function updateAndReanalyzeReport(
  userId: string,
  reportId: string,
  newResumes: Resume[],
  newFiles: { filename: string; data: ArrayBuffer }[],
  weights: MetricWeights
): Promise<ReadableStream<any>> {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        enqueue({ type: 'status', message: 'Loading existing report...' });
        const reportRef = doc(db, 'users', userId, 'analysisReports', reportId);
        const reportSnapshot = await getDoc(reportRef);
        if (!reportSnapshot.exists()) {
          throw new Error('Analysis report not found.');
        }
        const reportData = reportSnapshot.data();
        const jobDescription = reportData.jobDescription;
        const existingResumes = (reportData.resumes || []) as {filename: string, url: string}[];

        enqueue({ type: 'status', message: 'Uploading new resume files...' });
        const newResumeUrls = await Promise.all(newFiles.map(async (file) => {
          const storageRef = ref(storage, `resumehire/${userId}/${reportId}/${file.filename}`);
          await uploadBytes(storageRef, file.data);
          const downloadURL = await getDownloadURL(storageRef);
          return { filename: file.filename, url: downloadURL };
        }));

        const allResumesMap = new Map<string, {filename: string, url: string}>();
        existingResumes.forEach(r => allResumesMap.set(r.filename, r));
        newResumeUrls.forEach(r => allResumesMap.set(r.filename, r));
        
        const detailsCollectionRef = collection(db, 'users', userId, 'analysisReports', reportId, 'details');
        const detailsSnapshot = await getDocs(detailsCollectionRef);
        const allDetails: AnalysisDetails = detailsSnapshot.docs.reduce((acc, detailDoc) => {
          acc[detailDoc.id] = detailDoc.data() as AnalysisDetails[string];
          return acc;
        }, {});

        const resumesToAnalyze = newResumes.filter(r => !allDetails[r.filename]);

        if(resumesToAnalyze.length > 0) {
            enqueue({ type: 'status', message: `Analyzing ${resumesToAnalyze.length} new resumes...` });
            for (const resume of resumesToAnalyze) {
                enqueue({ type: 'status', message: `Analyzing new resume: ${resume.filename}...` });
                const skillsPromise = retry(() => parseResumeSkillsFlow({ resumeText: resume.content! }));
                const keywordsPromise = retry(() => matchKeywordsToResumeFlow({ resumeText: resume.content!, jobDescription }));
                const [skills, keywords] = await Promise.all([skillsPromise, keywordsPromise]);
                
                const detailData = { skills, keywords };
                allDetails[resume.filename] = detailData;

                const detailRef = doc(db, 'users', userId, 'analysisReports', reportId, 'details', resume.filename);
                await setDoc(detailRef, detailData);
            }
        }

        const allResumesForDb = Array.from(allResumesMap.values());
        
        const allRankedResumes = allResumesForDb.map(r => ({
            filename: r.filename,
            score: allDetails[r.filename]?.keywords?.score || 0,
            highlights: allDetails[r.filename]?.keywords?.summary || 'Awaiting full ranking analysis.',
        }));

        const sortedRankedResumes = [...allRankedResumes].sort((a, b) => b.score - a.score);

        const finalStatuses = { ...reportData.statuses };
        for (const resume of allResumesForDb) {
            if (!finalStatuses[resume.filename]) {
                finalStatuses[resume.filename] = 'none';
            }
        }
        
        await updateDoc(reportRef, { 
          resumes: allResumesForDb,
          rankedResumes: sortedRankedResumes, 
          statuses: finalStatuses
        });

        enqueue({ type: 'status', message: 'Finalizing updated report...' });
        const finalDocSnapshot = await getDoc(reportRef);
        const finalDocData = finalDocSnapshot.data();

         const finalReport: Report = {
            id: reportRef.id,
            jobDescription,
            rankedResumes: finalDocData?.rankedResumes || [],
            resumes: finalDocData?.resumes || [],
            details: allDetails,
            statuses: finalDocData?.statuses || {},
            createdAt: (finalDocData?.createdAt?.toDate() ?? new Date()).toISOString(),
        };

        enqueue({ type: 'done', report: finalReport });
        controller.close();
      } catch (e: any) {
        console.error('Error in updateAndReanalyzeReport stream:', e);
        enqueue({ type: 'error', error: e.message || 'An unexpected error occurred during re-analysis.' });
        controller.close();
      }
    },
  });
  return stream;
}

export async function updateAnalysisReportStatus(
  userId: string,
  reportId: string,
  statuses: Record<string, CandidateStatus>
): Promise<void> {
  try {
    if (!userId || !reportId) {
      throw new Error('Authentication error or invalid report ID.');
    }
    const reportRef = doc(db, 'users', userId, 'analysisReports', reportId);
    await updateDoc(reportRef, {statuses});
  } catch (e: any) {
    console.error('Error updating report statuses:', e);
    throw new Error('Failed to update candidate statuses.');
  }
}

export async function getAnalysisReports(
  userId: string
): Promise<Report[]> {
  try {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const reportsRef = collection(db, 'users', userId, 'analysisReports');
    const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(20));
    const querySnapshot = await getDocs(q);

    const reportsPromises = querySnapshot.docs.map(async docSnapshot => {
      const data = docSnapshot.data();
      const reportId = docSnapshot.id;

      const detailsCollectionRef = collection(db, 'users', userId, 'analysisReports', reportId, 'details');
      const detailsSnapshot = await getDocs(detailsCollectionRef);
      const details = detailsSnapshot.docs.reduce((acc, detailDoc) => {
        acc[detailDoc.id] = detailDoc.data() as AnalysisDetails[string];
        return acc;
      }, {} as AnalysisDetails);

      const rankedResumes = data.rankedResumes || [];
      const statuses = data.statuses || rankedResumes.reduce((acc: Record<string, CandidateStatus>, r: any) => {
          acc[r.filename] = 'none';
          return acc;
        }, {});

      return {
        id: reportId,
        jobDescription: data.jobDescription,
        rankedResumes: rankedResumes,
        resumes: data.resumes || [],
        details: details,
        statuses: statuses,
        createdAt: (data.createdAt?.toDate() ?? new Date()).toISOString(),
      } as Report;
    });

    const reports = await Promise.all(reportsPromises);
    return reports;
  } catch (e: any) {
    console.error('Error fetching analysis reports:', e);
    throw new Error('Failed to fetch past analysis reports.');
  }
}

export async function deleteAnalysisReport(
  userId: string,
  reportId: string
): Promise<void> {
  try {
    if (!userId || !reportId) {
      throw new Error('Authentication error or invalid report ID.');
    }
    const reportRef = doc(db, 'users', userId, 'analysisReports', reportId);

    // Delete subcollection 'details'
    const detailsCollectionRef = collection(reportRef, 'details');
    const detailsSnapshot = await getDocs(detailsCollectionRef);
    const deleteDetailsBatch = writeBatch(db);
    detailsSnapshot.forEach(doc => {
      deleteDetailsBatch.delete(doc.ref);
    });
    await deleteDetailsBatch.commit();

    // Delete files from storage
    const storageFolderRef = ref(storage, `resumehire/${userId}/${reportId}`);
    const fileList = await listAll(storageFolderRef);
    const deleteFilePromises = fileList.items.map(itemRef => deleteObject(itemRef));
    await Promise.all(deleteFilePromises);

    // Delete main report document
    await deleteDoc(reportRef);

  } catch (e: any) {
    console.error('Error deleting report:', e);
    throw new Error('Failed to delete the analysis report.');
  }
}

    