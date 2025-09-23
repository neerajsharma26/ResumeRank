'use server';
/**
 * @fileOverview A robust resume parser and scorer that takes a PDF and job description.
 *
 * - processResumeV2 - A function that processes a single resume PDF against a job description.
 * - ProcessResumeV2Input - The input type for the processResumeV2 function.
 * - ProcessResumeV2OutputSchema - The Zod schema for the structured JSON output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ProcessResumeV2InputSchema = z.object({
  resumePdfUrl: z
    .string()
    .describe(
      "A Google Cloud Storage URI (gs://) pointing to the resume PDF file."
    ),
  jobDescription: z.string().describe('The full text of the job description.'),
});
export type ProcessResumeV2Input = z.infer<typeof ProcessResumeV2InputSchema>;

export const ProcessResumeV2OutputSchema = z.object({
    candidate_name: z.string().nullable().describe("The candidate's full name."),
    contact: z.object({
        email: z.string().nullable(),
        phone: z.string().nullable(),
        location: z.string().nullable(),
    }).describe("Candidate's contact information."),
    links: z.object({
        linkedin: z.string().nullable(),
        github: z.string().nullable(),
        portfolio: z.string().nullable(),
    }).describe("Candidate's professional web links."),
    skills: z.array(z.string()).describe("A list of the candidate's skills."),
    education: z.array(z.object({
        degree: z.string().nullable(),
        institution: z.string().nullable(),
        start: z.string().nullable(),
        end: z.string().nullable(),
    })).describe("A list of the candidate's educational qualifications."),
    experience: z.array(z.object({
        title: z.string().nullable(),
        company: z.string().nullable(),
        start: z.string().nullable(),
        end: z.string().nullable(),
        summary: z.string().nullable(),
    })).describe("A list of the candidate's work experiences."),
    projects: z.array(z.object({
        name: z.string().nullable(),
        summary: z.string().nullable(),
        skills: z.array(z.string()),
    })).describe("A list of the candidate's projects."),
    certifications: z.array(z.string()).describe("A list of the candidate's certifications."),
    description: z.string().describe("A professional, one-paragraph summary of the candidate's profile and fit for the role based on the resume and job description."),
    scores: z.object({
        overall_score: z.number().describe("Overall ATS-style score from 0-100, considering all factors."),
        skill_match_score: z.number().describe("Score (0-100) based on how well the candidate's skills match the job description, considering recency and depth."),
        experience_score: z.number().describe("Score (0-100) based on relevance, duration, seniority, and impact of the candidate's work experience."),
        education_score: z.number().describe("Score (0-100) based on the relevance and level of the candidate's education to the job description."),
        keyword_optimization_score: z.number().describe("Score (0-100) for how well the resume is optimized with keywords from the job description."),
        clarity_and_formatting_score: z.number().describe("Score (0-100) for the resume's readability, structure, and professional formatting."),
        job_fit_score: z.number().describe("A holistic score (0-100) indicating the overall fit for the specific job, synthesizing all other factors."),
    }).describe("A set of 7 ATS-related scores, each out of 100."),
});
export type ProcessResumeV2Output = z.infer<typeof ProcessResumeV2OutputSchema>;


export async function processResumeV2(input: ProcessResumeV2Input): Promise<ProcessResumeV2Output> {
  return processResumeV2Flow(input);
}


const systemPrompt = `
ROLE: You are a strict resume parser & ATS scorer.
INPUTS: (1) One PDF resume file, (2) JOB_DESCRIPTION string.
TASKS:
1) Extract all details directly from the supplied PDF. No external tools.
2) Return EXACTLY one JSON matching this schema. No extra text/prose.
3) If any field is missing, return null, not a guess.
4) Scores must be numeric (0–100). Include a professional 1-paragraph description.
5) No markdown, no commentary, no keys beyond the provided schema.

SCORING GUIDANCE:
- skill_match_score: give higher weight to exact/close JD matches; recency and depth matter.
- education_score: level + relevance to JD.
- experience_score: relevance, duration, seniority, measurable impact.

Job Description to use for analysis and scoring:
---
{{{jobDescription}}}
---
`;

const prompt = ai.definePrompt({
  name: 'processResumeV2Prompt',
  input: { schema: ProcessResumeV2InputSchema },
  output: { schema: ProcessResumeV2OutputSchema },
  prompt: [
    { media: { url: '{{resumePdfUrl}}' } },
    { text: systemPrompt },
  ],
   model: 'googleai/gemini-1.5-flash',
   config: {
    temperature: 0.1,
  }
});


const processResumeV2Flow = ai.defineFlow(
  {
    name: 'processResumeV2Flow',
    inputSchema: ProcessResumeV2InputSchema,
    outputSchema: ProcessResumeV2OutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('No output received from the model.');
    }
    return output;
  }
);
