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
  prompt: `You are an expert HR assistant parsing a resume.

Analyze the following resume text and extract:
1.  A list of technical and soft skills.
2.  A list of any certifications mentioned.
3.  The total years of professional job experience.

Resume Text:
{{{resumeText}}}

Provide the output in the specified JSON format.
- If no skills are found, return an empty array for "skills".
- If no certifications are found, return an empty array for "certifications".
- If years of experience cannot be determined, set "experienceYears" to 0.
- Do not invent information that is not present in the resume.
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
