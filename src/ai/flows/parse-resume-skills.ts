'use server';

/**
 * @fileOverview Parses a resume to extract skills, certifications, and job experience.
 *
 * - parseResumeSkills - A function that handles the resume parsing process.
 * - ParseResumeSkillsInput - The input type for the parseResumeSkills function.
 * - ParseResumeSkillsOutput - The return type for the parseResumeSkills function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseResumeSkillsInputSchema = z.object({
  resumeText: z
    .string()
    .describe('The text content of the resume to be parsed.'),
});
export type ParseResumeSkillsInput = z.infer<typeof ParseResumeSkillsInputSchema>;

const ParseResumeSkillsOutputSchema = z.object({
  skills: z.array(z.string()).describe('A list of skills extracted from the resume.'),
  certifications: z
    .array(z.string())
    .describe('A list of certifications extracted from the resume.'),
  experienceYears: z
    .number()
    .describe('The total years of job experience extracted from the resume.'),
});
export type ParseResumeSkillsOutput = z.infer<typeof ParseResumeSkillsOutputSchema>;

export async function parseResumeSkills(input: ParseResumeSkillsInput): Promise<ParseResumeSkillsOutput> {
  return parseResumeSkillsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseResumeSkillsPrompt',
  input: {schema: ParseResumeSkillsInputSchema},
  output: {schema: ParseResumeSkillsOutputSchema},
  prompt: `You are an expert HR assistant who is tasked with parsing resumes.

  Analyze the following resume text to extract skills, certifications, and total years of job experience.

  Resume Text:
  {{{resumeText}}}

  Output the skills, certifications, and total years of experience in the JSON format.
  Do not make up any skills, certifications, or experience that is not explicitly mentioned in the resume.
  If the resume does not contain years of job experince, set the value to 0.
`,
});

const parseResumeSkillsFlow = ai.defineFlow(
  {
    name: 'parseResumeSkillsFlow',
    inputSchema: ParseResumeSkillsInputSchema,
    outputSchema: ParseResumeSkillsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
