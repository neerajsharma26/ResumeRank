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
} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL} from 'firebase/storage';

import type {
  AnalysisResult,
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


async function retry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 2000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (e.message?.includes('503')) {
        if (i < retries - 1) {
          console.log(`Attempt ${i + 1} failed with 503. Retrying in ${delay * Math.pow(2, i)}ms...`);
          await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
      } else {
        // Don't retry on non-503 errors
        break;
      }
    }
  }
  throw lastError;
}

async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const active: Promise<void>[] = [];
  let taskIndex = 0;

  const enqueue = (): Promise<void> | void => {
    if (taskIndex === tasks.length) {
      return;
    }
    const task = tasks[taskIndex]!;
    const currentIndex = taskIndex;
    taskIndex++;
    
    const promise = task().then(result => {
      results[currentIndex] = result;
    });

    const worker: Promise<void> = promise.then(() => {
        const index = active.indexOf(worker);
        if (index > -1) {
            active.splice(index, 1);
        }
        return enqueue();
    });
    
    active.push(worker);
  };
  
  const initialActives: (Promise<void> | void)[] = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    initialActives.push(enqueue());
  }

  await Promise.all(initialActives);
  await Promise.all(active);
  
  return results;
}

export async function analyzeResumesAction(
  jobDescription: string,
  resumes: Resume[],
  weights: MetricWeights,
  userId: string,
  files: {filename: string; data: ArrayBuffer}[],
  onAnalysisComplete: (report: Report) => void
): Promise<void> {
  try {
    if (!jobDescription.trim()) {
      throw new Error('Job description cannot be empty.');
    }
    if (resumes.length === 0) {
      throw new Error('Please select at least one resume to analyze.');
    }

    const batchSize = 2;
    const allRankedResumes: RankResumesOutput = [];
    const allDetails: AnalysisDetails = {};

    for (let i = 0; i < resumes.length; i += batchSize) {
      const resumeBatch = resumes.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(resumes.length / batchSize)}...`);

      const detailTasks = resumeBatch.map(
        (resume) => () =>
          retry(async () => {
            console.log(`Analyzing resume: ${resume.filename}`);
            const skillsPromise = parseResumeSkillsFlow({
              resumeText: resume.content,
            });
            const keywordsPromise = matchKeywordsToResumeFlow({
              resumeText: resume.content,
              jobDescription,
            });
            const [skills, keywords] = await Promise.all([
              skillsPromise,
              keywordsPromise,
            ]);
            console.log(`Finished analyzing resume: ${resume.filename}`);
            return {filename: resume.filename, skills, keywords};
          })
      );

      const detailsArray = await limitConcurrency(detailTasks, 2);

      const batchDetails = detailsArray.reduce((acc, detail) => {
        if(detail) {
          acc[detail.filename] = {
            skills: detail.skills,
            keywords: detail.keywords,
          };
        }
        return acc;
      }, {} as AnalysisDetails);

      Object.assign(allDetails, batchDetails);

      const tokenLightResumes = resumeBatch.map(resume => {
        const detail = batchDetails[resume.filename];
        const summary = `Top Skills: ${detail.skills.skills.slice(0, 5).join(', ')}. Experience: ${detail.skills.experienceYears} years. Keyword Score: ${detail.keywords.score}. Resume Excerpt: ${resume.content.substring(0, 500)}`;
        return {
          filename: resume.filename,
          content: summary,
        };
      });

      const rankInput: RankResumesInput = {
        resumes: tokenLightResumes,
        jobDescription,
        weights,
      };
      
      const rankedBatch = await retry(() => rankResumesFlow(rankInput));
      allRankedResumes.push(...rankedBatch);
    }
    
    const sortedRankedResumes = [...allRankedResumes].sort((a, b) => b.score - a.score);

    const statuses = sortedRankedResumes.reduce((acc, r) => {
      acc[r.filename] = 'none';
      return acc;
    }, {} as Record<string, CandidateStatus>);
    
    const initialResult: Omit<AnalysisResult, 'id' | 'createdAt'> = {
      rankedResumes: sortedRankedResumes,
      resumes: resumes.map(r => ({ filename: r.filename, content: ''})), // Content will be stored in Storage
      details: {}, // Details will be in a subcollection
      statuses,
    };
    
    if (!userId) {
      throw new Error("User not authenticated.");
    }
      
    const reportRef = await addDoc(
        collection(db, 'users', userId, 'analysisReports'),
        {
          jobDescription,
          rankedResumes: initialResult.rankedResumes,
          resumes: initialResult.resumes,
          statuses: initialResult.statuses,
          createdAt: serverTimestamp(),
        }
    );

    const batch = writeBatch(db);
    for (const [filename, detailData] of Object.entries(allDetails)) {
        const detailRef = doc(db, 'users', userId, 'analysisReports', reportRef.id, 'details', filename);
        batch.set(detailRef, detailData);
    }
    await batch.commit();

    const uploadPromises = files.map(async file => {
        const storageRef = ref(
          storage,
          `resumehire/${userId}/${reportRef.id}/${file.filename}`
        );
        await uploadBytes(storageRef, file.data);
        const downloadURL = await getDownloadURL(storageRef);
        const resumeIndex = initialResult.resumes.findIndex(
          r => r.filename === file.filename
        );
        if (resumeIndex !== -1) {
          (initialResult.resumes[resumeIndex] as any).url = downloadURL;
        }
    });
    
    await Promise.all(uploadPromises);

    await updateDoc(reportRef, {
        resumes: initialResult.resumes,
    });
    
    const finalDoc = await getDoc(reportRef);
    const finalData = finalDoc.data();

    const finalReport: Report = {
        id: reportRef.id,
        jobDescription,
        ...initialResult,
        resumes: initialResult.resumes,
        details: allDetails,
        createdAt: (finalData?.createdAt?.toDate() ?? new Date()).toISOString(),
    };

    onAnalysisComplete(finalReport);

  } catch (e: any) {
    console.error('Error in analyzeResumesAction:', e);
    throw new Error(e.message || 'An unexpected error occurred during analysis.');
  }
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
      };
    });

    const reports = await Promise.all(reportsPromises);
    return reports;
  } catch (e: any) {
    console.error('Error fetching analysis reports:', e);
    throw new Error('Failed to fetch past analysis reports.');
  }
}
