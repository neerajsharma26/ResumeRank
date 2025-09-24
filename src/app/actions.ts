

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


export async function analyzeSingleResumeAction(
  jobDescription: string,
  resume: Resume, // must contain filename (+ content if your flows need text)
  weights: MetricWeights,
  userId: string,
  file: { filename: string; data: ArrayBuffer },
  opts?: { reportId?: string } // optional existing report to append
): Promise<ReadableStream<any>> {

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        // ---- validations
        if (!userId) throw new Error('Unauthenticated');
        if (!jobDescription?.trim()) throw new Error('Job description cannot be empty.');
        if (!resume?.filename) throw new Error('Invalid resume payload.');
        if (!file?.data || !file?.filename) throw new Error('Resume file is missing.');

        send({ type: 'status', message: 'Initializing report...' });

        // ---- ensure a report (create if not provided)
        let reportRef;
        if (opts?.reportId) {
          reportRef = doc(db, 'users', userId, 'analysisReports', opts.reportId);
          const snap = await getDoc(reportRef);
          if (!snap.exists()) throw new Error('Report not found for given reportId.');
        } else {
          const initial = {
            jobDescription,
            rankedResumes: [],
            statuses: {},
            createdAt: serverTimestamp(),
            resumes: [] as Array<{ filename: string; url: string }>
          };
          reportRef = await addDoc(collection(db, 'users', userId, 'analysisReports'), initial);
          send({ type: 'reportId', id: reportRef.id });
        }

        // ---- upload ONLY this resume file
        send({ type: 'status', message: `Uploading ${file.filename}...` });
        const storageRef = ref(storage, `resumehire/${userId}/${reportRef.id}/${file.filename}`);
        await uploadBytes(storageRef, file.data);
        const downloadURL = await getDownloadURL(storageRef);

        // ---- upsert this resume entry into report.resumes
        const reportSnap1 = await getDoc(reportRef);
        const current = reportSnap1.data() || {};
        const existingResumes: Array<{ filename: string; url: string }> = current.resumes ?? [];
        const withoutThis = existingResumes.filter(r => r.filename !== file.filename);
        const finalResumes = [...withoutThis, { filename: file.filename, url: downloadURL }];
        await updateDoc(reportRef, { resumes: finalResumes });
        send({ type: 'resumes', resumes: finalResumes });

        // ---- analysis (skills + keywords) for THIS resume only
        send({ type: 'status', message: `Parsing skills for ${resume.filename}...` });
        const skills = await retry(() =>
          parseResumeSkillsFlow({ resumeText: resume.content }) // if your flow takes text
        );

        send({ type: 'status', message: `Matching keywords for ${resume.filename}...` });
        const keywords = await retry(() =>
          matchKeywordsToResumeFlow({ resumeText: resume.content, jobDescription })
        );

        // ---- write details/<filename>
        send({ type: 'status', message: 'Saving analysis details...' });
        const batch = writeBatch(db);
        const detailRef = doc(db, 'users', userId, 'analysisReports', reportRef.id, 'details', resume.filename);
        const detailData = { skills, keywords } satisfies AnalysisDetails[string];
        batch.set(detailRef, detailData);
        await batch.commit();

        send({ type: 'detail', filename: resume.filename, detail: detailData });

        // ---- score/rank this single resume (call your existing rank flow with single-element array)
        send({ type: 'status', message: 'Scoring resume...' });
        const rankedSingle = await retry(() =>
          rankResumesFlow({
            resumes: [resume],
            jobDescription,
            weights
          })
        );
        const singleResult = rankedSingle[0]; // score for this resume

        // ---- merge into report.rankedResumes and statuses; keep sorted desc by score
        const reportSnap2 = await getDoc(reportRef);
        const rdata = reportSnap2.data() || {};
        const prevRanked: Array<{ filename: string; score: number; [k: string]: any }> = rdata.rankedResumes ?? [];
        const filtered = prevRanked.filter(r => r.filename !== resume.filename);
        const merged = [...filtered, singleResult].sort((a, b) => b.score - a.score);

        // statuses: add default for new resume, keep existing others
        const prevStatuses: Record<string, CandidateStatus> = rdata.statuses ?? {};
        const statuses = { ...prevStatuses, [resume.filename]: prevStatuses[resume.filename] ?? 'none' };

        await updateDoc(reportRef, {
          rankedResumes: merged,
          statuses
        });

        send({ type: 'rank', filename: resume.filename, score: singleResult.score });

        // ---- finalize (return a light final snapshot so UI can refresh)
        const finalSnap = await getDoc(reportRef);
        const fd = finalSnap.data();

        const finalReport: Report = {
          id: reportRef.id,
          jobDescription: fd?.jobDescription ?? jobDescription,
          rankedResumes: fd?.rankedResumes ?? merged,
          resumes: fd?.resumes ?? finalResumes,
          details: { [resume.filename]: detailData }, // only this call’s detail; UI can fetch others as needed
          statuses: fd?.statuses ?? statuses,
          createdAt: (fd?.createdAt?.toDate?.() ?? new Date()).toISOString(),
        };

        send({ type: 'done', report: finalReport });
        controller.close();

      } catch (e: any) {
        console.error('Error in analyzeSingleResumeAction stream:', e);
        const msg = e?.message || 'Unexpected error during single-resume analysis.';
        try { send({ type: 'error', error: msg }); } finally { controller.close(); }
      }
    }
  });

  return stream;
}
export async function analyzeBatchResumesAction(
  jobDescription: string,
  resumes: Resume[], // length: 1..3 (frontend should chunk in 3s)
  weights: MetricWeights,
  userId: string,
  files: { filename: string; data: ArrayBuffer }[], // same order as resumes
  opts?: { reportId?: string },
): Promise<ReadableStream<any>> {

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: object) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));

      try {
        // ---- validations
        if (!userId) throw new Error('Unauthenticated');
        if (!jobDescription?.trim()) throw new Error('Job description cannot be empty.');
        if (!Array.isArray(resumes) || resumes.length === 0) throw new Error('No resumes provided.');
        if (resumes.length > 3) throw new Error('Max 3 resumes per batch.');
        if (!Array.isArray(files) || files.length !== resumes.length) {
          throw new Error('Files array must match resumes array length.');
        }
        for (let i = 0; i < resumes.length; i++) {
          if (!resumes[i]?.filename) throw new Error(`Invalid resume at index ${i}.`);
          if (!files[i]?.filename || !files[i]?.data) throw new Error(`Missing file data at index ${i}.`);
        }

        send({ type: 'status', message: `Initializing report (batch size: ${resumes.length})...` });

        // ---- ensure/create report
        let reportRef;
        if (opts?.reportId) {
          reportRef = doc(db, 'users', userId, 'analysisReports', opts.reportId);
          const snap = await getDoc(reportRef);
          if (!snap.exists()) throw new Error('Report not found for given reportId.');
        } else {
          const initial = {
            jobDescription,
            rankedResumes: [],
            statuses: {},
            createdAt: serverTimestamp(),
            resumes: [] as Array<{ filename: string; url: string }>,
          };
          reportRef = await addDoc(collection(db, 'users', userId, 'analysisReports'), initial);
          send({ type: 'reportId', id: reportRef.id });
        }

        // ---- upload ALL files in this batch (parallel)
        send({ type: 'status', message: 'Uploading files for batch...' });
        const uploaded = await Promise.all(files.map(async (f) => {
          const storageRef = ref(storage, `resumehire/${userId}/${reportRef.id}/${f.filename}`);
          await uploadBytes(storageRef, f.data);
          const url = await getDownloadURL(storageRef);
          return { filename: f.filename, url };
        }));

        // ---- upsert resumes[] in report (merge existing + these)
        const snap1 = await getDoc(reportRef);
        const current = snap1.data() || {};
        const existingResumes: Array<{ filename: string; url: string }> = current.resumes ?? [];
        const byName = new Map<string, string>(existingResumes.map(r => [r.filename, r.url]));
        uploaded.forEach(u => byName.set(u.filename, u.url)); // overwrite or insert
        const finalResumes = Array.from(byName, ([filename, url]) => ({ filename, url }));
        await updateDoc(reportRef, { resumes: finalResumes });
        send({ type: 'resumes', resumes: finalResumes });

        // ---- analysis: skills+keywords for each resume (parallel inside batch)
        send({ type: 'status', message: 'Analyzing skills & keywords for batch...' });

        const detailsArray = await Promise.all(resumes.map(async (resume) => {
          try {
            send({ type: 'status', message: `Parsing skills for ${resume.filename}...` });
            const skills = await retry(() => parseResumeSkillsFlow({ resumeText: resume.content }));

            send({ type: 'status', message: `Matching keywords for ${resume.filename}...` });
            const keywords = await retry(() =>
              matchKeywordsToResumeFlow({ resumeText: resume.content, jobDescription })
            );

            return { filename: resume.filename, skills, keywords, ok: true as const };
          } catch (err: any) {
            send({ type: 'error', error: `Detail extraction failed for ${resume.filename}: ${err?.message ?? 'Unknown error'}` });
            return { filename: resume.filename, ok: false as const };
          }
        }));

        // ---- write details/ for those that succeeded (single batch write)
        const wb = writeBatch(db);
        const detailMap: AnalysisDetails = {};
        for (const d of detailsArray) {
          if (!d.ok) continue;
          const ref = doc(db, 'users', userId, 'analysisReports', reportRef.id, 'details', d.filename);
          const detailData = { skills: d.skills, keywords: d.keywords };
          detailMap[d.filename] = detailData;
          wb.set(ref, detailData);
        }
        await wb.commit();

        // stream details out (for UI)
        Object.entries(detailMap).forEach(([filename, detail]) => {
          send({ type: 'detail', filename, detail });
        });

        // ---- rank the batch (only the successfully detailed resumes)
        const rankable = resumes.filter(r => r.filename in detailMap);
        if (rankable.length > 0) {
          send({ type: 'status', message: 'Scoring batch...' });
          const ranked = await retry(() =>
            rankResumesFlow({ resumes: rankable, jobDescription, weights })
          );

          // ---- merge into report.rankedResumes & statuses
          const snap2 = await getDoc(reportRef);
          const rdata = snap2.data() || {};
          const prevRanked: Array<{ filename: string; score: number; [k: string]: any }> = rdata.rankedResumes ?? [];
          const prevStatuses: Record<string, CandidateStatus> = rdata.statuses ?? {};

          // remove any of these filenames then add new scores
          const exclude = new Set(rankable.map(r => r.filename));
          const filtered = prevRanked.filter(r => !exclude.has(r.filename));
          const merged = [...filtered, ...ranked].sort((a, b) => b.score - a.score);

          const statuses: Record<string, CandidateStatus> = { ...prevStatuses };
          rankable.forEach(r => {
            if (!(r.filename in statuses)) statuses[r.filename] = 'none';
          });

          await updateDoc(reportRef, { rankedResumes: merged, statuses });

          // emit rank events per resume
          ranked.forEach(r => send({ type: 'rank', filename: r.filename, score: r.score }));
        }

        // ---- final light snapshot (optional convenience)
        const finalSnap = await getDoc(reportRef);
        const fd = finalSnap.data();

        // Only include details for this batch to keep payload small
        const finalReport: Report = {
          id: reportRef.id,
          jobDescription: fd?.jobDescription ?? jobDescription,
          rankedResumes: fd?.rankedResumes ?? [],
          resumes: fd?.resumes ?? finalResumes,
          details: detailMap,
          statuses: fd?.statuses ?? {},
          createdAt: (fd?.createdAt?.toDate?.() ?? new Date()).toISOString(),
        };

        send({ type: 'done', report: finalReport });
        controller.close();

      } catch (e: any) {
        console.error('Error in analyzeBatchResumesAction stream:', e);
        const msg = e?.message || 'Unexpected error during batch analysis.';
        try { send({ type: 'error', error: msg }); } finally { controller.close(); }
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
        
        // --- Single Source of Truth for Resumes ---
        const allResumesMap = new Map<string, { filename: string, url: string, content?: string }>();
        // Load existing resumes
        if (reportData.resumes) {
          for (const resume of reportData.resumes) {
            allResumesMap.set(resume.filename, resume);
          }
        }
        // Add/overwrite with new resumes
        for (const resume of newResumes) {
            allResumesMap.set(resume.filename, { ...allResumesMap.get(resume.filename), ...resume });
        }
        
        enqueue({ type: 'status', message: 'Uploading new resume files...' });
        for (const file of newFiles) {
            const storageRef = ref(storage, `resumehire/${userId}/${reportId}/${file.filename}`);
            await uploadBytes(storageRef, file.data);
            const downloadURL = await getDownloadURL(storageRef);
            allResumesMap.set(file.filename, { ...allResumesMap.get(file.filename)!, url: downloadURL });
        }
        
        const detailsCollectionRef = collection(db, 'users', userId, 'analysisReports', reportId, 'details');
        const detailsSnapshot = await getDocs(detailsCollectionRef);
        const allDetails: AnalysisDetails = detailsSnapshot.docs.reduce((acc, detailDoc) => {
          acc[detailDoc.id] = detailDoc.data() as AnalysisDetails[string];
          return acc;
        }, {} as AnalysisDetails);

        const resumesToAnalyze = Array.from(allResumesMap.values()).filter(r => !allDetails[r.filename] && r.content);

        if(resumesToAnalyze.length > 0) {
            enqueue({ type: 'status', message: `Analyzing ${resumesToAnalyze.length} new resume(s)...` });
            for (const resume of resumesToAnalyze) {
                enqueue({ type: 'status', message: `Analyzing new resume: ${resume.filename}...` });
                const skillsPromise = retry(() => parseResumeSkillsFlow({ resumeText: resume.content! }));
                const keywordsPromise = retry(() => matchKeywordsToResumeFlow({ resumeText: resume.content!, jobDescription }));
                const [skills, keywords] = await Promise.all([skillsPromise, keywordsPromise]);
                
                const detailData = { skills, keywords };
                allDetails[resume.filename] = detailData;

                const detailRef = doc(db, 'users', userId, 'analysisReports', reportId, 'details', resume.filename);
                await setDoc(detailRef, detailData);
                enqueue({ type: 'detail', filename: resume.filename, detail: detailData });
            }
        }
        
        const allResumesForRanking = Array.from(allResumesMap.values()).map(r => ({
            filename: r.filename,
            content: r.content || '' // Ranker needs content; this will be empty for old resumes but that's ok
        }));

        enqueue({ type: 'status', message: 'Ranking all candidates...' });
        const rankResumesInput: RankResumesInput = {
            resumes: allResumesForRanking,
            jobDescription: jobDescription,
            weights: weights,
        };
        const rankedResumes = await retry(() => rankResumesFlow(rankResumesInput));
        const sortedRankedResumes = [...rankedResumes].sort((a, b) => b.score - a.score);
        
        const allResumesForDb = Array.from(allResumesMap.values()).map(({ content, ...rest }) => rest); // Remove content before DB write
        
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
