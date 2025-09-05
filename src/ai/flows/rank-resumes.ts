'use server';

/**
 * @fileOverview Ranks resumes based on relevance to a job description.
 *
 * - rankResumes - A function that takes resumes and a job description, and returns a ranked list of resumes with scores and highlights.
 * - RankResumesInput - The input type for the rankResumes function.
 * - RankResumesOutput - The return type for the rankResumes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ResumeSchema = z.object({
  filename: z.string(),
  content: z.string(),
});

const WeightSchema = z.object({
  skills: z.number(),
  experience: z.number(),
  education: z.number(),
});

const RankResumesInputSchema = z.object({
  resumes: z.array(ResumeSchema).describe('An array of resumes to rank.'),
  jobDescription: z.string().describe('The job description to rank resumes against.'),
  weights: WeightSchema.describe('Weights for different ranking criteria.'),
});
export type RankResumesInput = z.infer<typeof RankResumesInputSchema>;

const RankedResumeSchema = z.object({
  filename: z.string().describe('The filename of the resume.'),
  score: z.number().describe('The relevance score (0-100) of the resume to the job description.'),
  highlights: z.string().describe('A brief summary of key matches and areas of improvement for the resume.'),
});

const RankResumesOutputSchema = z.array(RankedResumeSchema);
export type RankResumesOutput = z.infer<typeof RankResumesOutputSchema>;

export async function rankResumes(input: RankResumesInput): Promise<RankResumesOutput> {
  return rankResumesFlow(input);
}

const rankResumesPrompt = ai.definePrompt({
  name: 'rankResumesPrompt',
  input: {schema: RankResumesInputSchema},
  output: {schema: RankResumesOutputSchema},
  prompt: `You are an expert HR assistant tasked with ranking resumes based on their relevance to a job description.

Analyze each resume against the provided job description. Assign a score from 0 to 100, where 100 is a perfect match. Provide a concise highlight summary for each, noting key strengths and weaknesses.

Consider the following weights when calculating the score:
- Skills Match: {{weights.skills}}
- Experience Relevance: {{weights.experience}}
- Education Background: {{weights.education}}

A higher weight means the factor is more important.

Job Description:
{{{jobDescription}}}

Resumes:
{{#each resumes}}
---
Filename: {{this.filename}}
Content:
{{{this.content}}}
---
{{/each}}

Return the ranked list as a JSON array of objects, each containing "filename", "score", and "highlights".
`,
});

const rankResumesFlow = ai.defineFlow(
  {
    name: 'rankResumesFlow',
    inputSchema: RankResumesInputSchema,
    outputSchema: RankResumesOutputSchema,
  },
  async input => {
    const {output} = await rankResumesPrompt(input);
    return output!;
  }
);
