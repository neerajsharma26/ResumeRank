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
import {collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit} from 'firebase/firestore';

import type { AnalysisResult, Resume } from '@/lib/types';

export type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
};

export async function analyzeResumesAction(
  jobDescription: string,
  resumes: Resume[],
  userId: string
): Promise<AnalysisResult> {
  try {
    if (!jobDescription.trim()) {
      throw new Error('Job description cannot be empty.');
    }
    if (resumes.length === 0) {
      throw new Error('Please select at least one resume to analyze.');
    }

    const rankPromise = rankResumesFlow({ jobDescription, resumes });

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
    
    const result: AnalysisResult = { rankedResumes: sortedRankedResumes, details };

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
      return {
        id: doc.id,
        jobDescription: data.jobDescription,
        rankedResumes: data.rankedResumes,
        details: data.details,
        createdAt: (data.createdAt?.toDate() ?? new Date()).toISOString(),
      };
    });
    
    return reports;
  } catch (e: any) {
    console.error('Error fetching analysis reports:', e);
    throw new Error('Failed to fetch analysis reports.');
  }
}
