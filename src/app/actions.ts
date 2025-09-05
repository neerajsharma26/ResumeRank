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
import {db} from '@/lib/firebase';
import {collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, doc, updateDoc} from 'firebase/firestore';

import type { AnalysisResult, Resume, MetricWeights, CandidateStatus } from '@/lib/types';

export type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
};

export async function analyzeResumesAction(
  jobDescription: string,
  resumes: Resume[],
  weights: MetricWeights,
  userId: string
): Promise<AnalysisResult> {
  try {
    if (!jobDescription.trim()) {
      throw new Error('Job description cannot be empty.');
    }
    if (resumes.length === 0) {
      throw new Error('Please select at least one resume to analyze.');
    }

    const rankPromise = rankResumesFlow({ jobDescription, resumes, weights });

    const detailPromises = resumes.map(async (resume) => {
      const skillsPromise = parseResumeSkillsFlow({ resumeText: resume.content });
      const keywordsPromise = matchKeywordsToResumeFlow({
        resumeText: resume.content,
        jobDescription,
      });
      const [skills, keywords] = await Promise.all([
        skillsPromise,
        keywordsPromise,
      ]);
      return { filename: resume.filename, skills, keywords };
    });

    const [rankedResumes, detailsArray] = await Promise.all([
      rankPromise,
      Promise.all(detailPromises),
    ]);

    const details = detailsArray.reduce((acc, detail) => {
      acc[detail.filename] = { skills: detail.skills, keywords: detail.keywords };
      return acc;
    }, {} as AnalysisResult['details']);
    
    const sortedRankedResumes = [...rankedResumes].sort((a, b) => b.score - a.score);

    const statuses = sortedRankedResumes.reduce((acc, r) => {
      acc[r.filename] = 'none';
      return acc;
    }, {} as Record<string, CandidateStatus>);
    
    const result: AnalysisResult = { rankedResumes: sortedRankedResumes, resumes, details, statuses };

    if (userId) {
      await addDoc(collection(db, 'users', userId, 'analysisReports'), {
        ...result,
        jobDescription,
        createdAt: serverTimestamp(),
      });
    }

    return result;
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
    await updateDoc(reportRef, { statuses });
  } catch (e: any) {
    console.error('Error updating report statuses:', e);
    throw new Error('Failed to update candidate statuses.');
  }
}


export async function getAnalysisReports(userId: string): Promise<(AnalysisResult & { id: string, jobDescription: string, createdAt: string })[]> {
  try {
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    const reportsRef = collection(db, 'users', userId, 'analysisReports');
    const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(20));
    const querySnapshot = await getDocs(q);
    
    const reports = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Ensure statuses field exists, providing a default if it doesn't
      const statuses = data.statuses || data.rankedResumes.reduce((acc: Record<string, CandidateStatus>, r: any) => {
        acc[r.filename] = 'none';
        return acc;
      }, {});

      return {
        id: doc.id,
        jobDescription: data.jobDescription,
        rankedResumes: data.rankedResumes,
        resumes: data.resumes || [],
        details: data.details,
        statuses: statuses,
        createdAt: (data.createdAt?.toDate() ?? new Date()).toISOString(),
      };
    });
    
    return reports;
  } catch (e: any) {
    console.error('Error fetching analysis reports:', e);
    throw new Error('Failed to fetch analysis reports.');
  }
}
