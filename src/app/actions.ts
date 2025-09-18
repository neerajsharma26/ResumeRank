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
): Promise<Report> {
  try {
    if (!jobDescription.trim()) {
      throw new Error('Job description cannot be empty.');
    }
    if (resumes.length === 0) {
      throw new Error('Please select at least one resume to analyze.');
    }

    // Step 1: Perform all AI analysis concurrently to get details
    const detailPromises = resumes.map(async (resume) => {
        const skillsPromise = retry(() => parseResumeSkillsFlow({ resumeText: resume.content }));
        const keywordsPromise = retry(() => matchKeywordsToResumeFlow({ resumeText: resume.content, jobDescription }));
        const [skills, keywords] = await Promise.all([skillsPromise, keywordsPromise]);
        return { filename: resume.filename, skills, keywords };
    });

    const detailsArray = await Promise.all(detailPromises);
    const allDetails: AnalysisDetails = detailsArray.reduce((acc, detail) => {
        acc[detail.filename] = { skills: detail.skills, keywords: detail.keywords };
        return acc;
    }, {} as AnalysisDetails);

    // Create a simple, unranked list of resumes for the initial report.
    // The ranking can be done later as a separate, more robust action.
    const unrankedResumes = resumes.map(resume => ({
      filename: resume.filename,
      score: allDetails[resume.filename].keywords.score || 0, // Use keyword score as a placeholder
      highlights: allDetails[resume.filename].keywords.summary || 'Awaiting full ranking analysis.',
    }));

    // Sort by placeholder score
    const sortedRankedResumes = [...unrankedResumes].sort((a, b) => b.score - a.score);

    // Prepare initial report data for Firestore
    const statuses = sortedRankedResumes.reduce((acc, r) => {
      acc[r.filename] = 'none';
      return acc;
    }, {} as Record<string, CandidateStatus>);

    const initialReportData = {
        jobDescription,
        rankedResumes: sortedRankedResumes,
        statuses,
        createdAt: serverTimestamp(),
        resumes: resumes.map(r => ({ filename: r.filename, url: '' })) // Placeholder for URLs
    };

    // Create the report document in Firestore
    const reportRef = await addDoc(collection(db, 'users', userId, 'analysisReports'), initialReportData);

    // Write details to a subcollection
    const detailsBatch = writeBatch(db);
    for (const [filename, detailData] of Object.entries(allDetails)) {
        const detailRef = doc(db, 'users', userId, 'analysisReports', reportRef.id, 'details', filename);
        detailsBatch.set(detailRef, detailData);
    }
    await detailsBatch.commit();

    // Upload files to Storage and get URLs
    const uploadPromises = files.map(async file => {
        const storageRef = ref(storage, `resumehire/${userId}/${reportRef.id}/${file.filename}`);
        await uploadBytes(storageRef, file.data);
        const downloadURL = await getDownloadURL(storageRef);
        return { filename: file.filename, url: downloadURL };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    const resumeUrlMap = uploadedFiles.reduce((acc, file) => {
        acc[file.filename] = file.url;
        return acc;
    }, {} as Record<string, string>);

    // Update the report with resume URLs
    const finalResumes = resumes.map(r => ({
        filename: r.filename,
        url: resumeUrlMap[r.filename] || ''
    }));

    await updateDoc(reportRef, { resumes: finalResumes });

    // Construct the final report object to return to the client
    const finalDocSnapshot = await getDoc(reportRef);
    const finalDocData = finalDocSnapshot.data();

    const finalReport: Report = {
        id: reportRef.id,
        jobDescription,
        rankedResumes: sortedRankedResumes,
        resumes: finalResumes,
        details: allDetails,
        statuses,
        createdAt: (finalDocData?.createdAt?.toDate() ?? new Date()).toISOString(),
    };

    return finalReport;

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
      } as Report;
    });

    const reports = await Promise.all(reportsPromises);
    return reports;
  } catch (e: any) {
    console.error('Error fetching analysis reports:', e);
    throw new Error('Failed to fetch past analysis reports.');
  }
}
