'use server';
/**
 * @fileOverview Matches keywords from a job description to skills and experience in a resume.
 *
 * - matchKeywordsToResume - A function that compares resume content against job description keywords.
 * - MatchKeywordsToResumeInput - The input type for the matchKeywordsToResume function.
 * - MatchKeywordsToResumeOutput - The return type for the matchKeywordsToResume function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MatchKeywordsToResumeInputSchema = z.object({
  resumeText: z
    .string()
    .describe('The extracted text content from the resume.'),
  jobDescription: z
    .string()
    .describe('The job description to match against the resume.'),
});
export type MatchKeywordsToResumeInput = z.infer<typeof MatchKeywordsToResumeInputSchema>;

const MatchKeywordsToResumeOutputSchema = z.object({
  matches: z
    .array(z.string())
    .describe('Keywords from the job description that appear in the resume.'),
  missing: z
    .array(z.string())
    .describe('Keywords from the job description that are missing from the resume.'),
  score: z.number().describe('A relevance score indicating how well the resume matches the job description.'),
  summary: z.string().describe('A brief summary of how well the resume matches the job description'),
});
export type MatchKeywordsToResumeOutput = z.infer<typeof MatchKeywordsToResumeOutputSchema>;

export async function matchKeywordsToResume(
  input: MatchKeywordsToResumeInput
): Promise<MatchKeywordsToResumeOutput> {
  return matchKeywordsToResumeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'matchKeywordsToResumePrompt',
  input: {schema: MatchKeywordsToResumeInputSchema},
  output: {schema: MatchKeywordsToResumeOutputSchema},
  prompt: `You are an expert HR assistant specializing in resume screening. Compare the resume content against the job description and provide the following:

- matches: Keywords from the job description that appear in the resume.
- missing: Keywords from the job description that are missing from the resume.
- score: A relevance score (0-100) indicating how well the resume matches the job description.
- summary: A brief summary of how well the resume matches the job description, explaining the score.

Resume:
{{resumeText}}

Job Description:
{{jobDescription}}`,
});

const matchKeywordsToResumeFlow = ai.defineFlow(
  {
    name: 'matchKeywordsToResumeFlow',
    inputSchema: MatchKeywordsToResumeInputSchema,
    outputSchema: MatchKeywordsToResumeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
