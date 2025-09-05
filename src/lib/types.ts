import type {
  RankResumesOutput,
  ParseResumeSkillsOutput,
  MatchKeywordsToResumeOutput,
} from '@/app/actions';

export type Resume = {
  filename: string;
  content: string;
};

export type AnalysisDetails = {
  [key: string]: {
    skills: ParseResumeSkillsOutput;
    keywords: MatchKeywordsToResumeOutput;
  };
};

export type AnalysisResult = {
  rankedResumes: RankResumesOutput;
  details: AnalysisDetails;
};
