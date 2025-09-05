import type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
} from '@/app/actions';

export type Resume = {
  filename: string;
  content: string;
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
  details: AnalysisDetails;
  statuses: Record<string, CandidateStatus>;
};

export interface MetricWeights {
  skills: number;
  experience: number;
  education: number;
}
