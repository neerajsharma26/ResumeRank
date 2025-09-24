import type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
} from '@/app/actions';
import type { z } from 'zod';
import type { ProcessResumeV2OutputSchema, ScorePackV2 } from '@/ai/flows/process-resume-v2';

export type Resume = {
  filename: string;
  content: string;
  url?: string;
};

export type CandidateStatus = 'none' | 'shortlisted' | 'rejected';

export type AnalysisDetails = {
  [key: string]: {
    skills: ParseResumeSkillsOutput;
    keywords: MatchKeywordsToResumeOutput;
  };
};

export type AnalysisResult = {
  rankedResumes: RankResumesOutput;
  resumes: Resume[];
  details: AnalysisDetails;
  statuses: Record<string, CandidateStatus>;
};

export interface MetricWeights {
  skills: number;
  experience: number;
  education: number;
}


// V2 Pipeline Types
export type BatchStatus = 'running' | 'paused' | 'cancelled' | 'complete';
export type ResumeV2Status =
  | 'pending' | 'running' | 'complete' | 'failed'
  | 'timeout' | 'cancelled' | 'paused' | 'skipped_duplicate';

export interface BatchDoc {
  id: string;
  batchId: string;
  userId: string;
  status: BatchStatus;
  jobDescription: string;
  total: number;
  completed: number;
  failed: number;
  cancelledCount: number;
  skippedDuplicates: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type Batch = BatchDoc; // Alias for UI components

// The full JSON output from the Gemini call
export type ResumeJSONV2 = z.infer<typeof ProcessResumeV2OutputSchema>;

export interface ResumeDoc {
  id: string;
  resumeId: string;
  batchId: string;
  fileUrl: string; // gs:// URI
  fileHash: string | null;
  status: ResumeV2Status;
  startTime: string | null; // ISO string
  lastUpdatedAt: string; // ISO string
  workerId: string | null;
  retryCount: number;
  maxRetries: number;
  result: {
    json: ResumeJSONV2 | null;
    description: string | null;
    scores: ScorePackV2 | null;
    schemaVersion: number;
    modelVersion: string;
  } | null;
  error: { code: string; message: string } | null;
}

export type ResumeV2 = ResumeDoc; // Alias for UI components

    

    
