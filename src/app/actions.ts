// This file is intentionally left empty. The logic will be included in main-page.tsx for simplicity with use-server directive.
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
import {collection, addDoc, serverTimestamp} from 'firebase/firestore';

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
    
    // Sort rankedResumes by score descending
    const sortedRankedResumes = [...rankedResumes].sort((a, b) => b.score - a.score);
    
    const result: AnalysisResult = { rankedResumes: sortedRankedResumes, details };

    // Store in Firestore
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
    // Re-throw the error to be caught by the client
    throw new Error(e.message || 'An unexpected error occurred during analysis.');
  }
}
