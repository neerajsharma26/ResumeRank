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

export const ScoreBreakdownV2 = z.object({
  skills_match: z.number().min(0).max(25).describe("Score based on skill alignment."),
  experience_relevance: z.number().min(0).max(25).describe("Score for relevant work experience."),
  education: z.number().min(0).max(15).describe("Score for educational qualifications."),
  certifications: z.number().min(0).max(5).describe("Score for relevant certifications."),
  career_progression: z.number().min(0).max(10).describe("Score based on career growth and stability."),
  keywords_alignment: z.number().min(0).max(10).describe("Score for keyword optimization against the job description."),
  formatting_quality: z.number().min(0).max(10).describe("Score for resume clarity and formatting."),
});

export const ScorePackV2 = z.object({
  total_score: z.number().min(0).max(100).describe("The final, weighted total score for the candidate."),
  breakdown: ScoreBreakdownV2.describe("The detailed breakdown of how the total score was calculated."),
  ats_score: z.number().min(0).max(100).describe("An overall ATS-style score."),
  skill_match_score: z.number().min(0).max(100).describe("A specific score for skill matching."),
  education_score: z.number().min(0).max(100).describe("A specific score for education."),
  experience_score: z.number().min(0).max(100).describe("A specific score for experience.")
});

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
    scores: ScorePackV2,
    debug: z.object({
        debug_mode_enabled: z.boolean(),
        sources: z.array(z.object({
            field: z.string(),
            snippet: z.string(),
            page: z.number().nullable()
        }))
    }).optional().describe("Optional debug information about data extraction sources."),
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
