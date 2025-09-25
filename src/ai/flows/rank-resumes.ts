'use server';
/**
 * @fileOverview ATS ranking with matrix-based rubric:
 *  - 8 parameters with sub-parameters
 *  - RAW 0–5 at sub-param level → server computes weighted points → total/100
 *  - Keyword matches/missing sourced from matchKeywordsToResumeFlow (not LLM guesses)
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { matchKeywordsToResume } from '@/ai/flows/match-keywords-to-resume';

/* ----------------------------- Config / Weights ----------------------------- */

/** Top-level parameter weights (sum = 100) */
const ATS_WEIGHTS = {
  skills: 25,
  experience: 25,
  education: 15,
  certifications: 5,
  achievements: 5,
  projectsImpact: 5,
  jdKeywords: 15,
  submissionQuality: 5,
} as const;

type MetricKey = keyof typeof ATS_WEIGHTS;

/** Sub-parameter weight splits (percent of the parameter) */
const SUB_WEIGHTS: Record<MetricKey, Record<string, number>> = {
  skills: { hard: 40, soft: 20, domain: 40 },
  experience: { eyoe: 40, roleSimilarity: 30, industry: 30 },
  education: { degree: 40, field: 30, relevance: 30 },
  certifications: { presence: 40, relevance: 60 },
  achievements: { relevance: 100 },
  projectsImpact: { presence: 40, relevance: 60 },
  jdKeywords: { mustHave: 40, jdAlignment: 40, niceToHave: 20 },
  submissionQuality: { atsFormatting: 30, readabilityParsing: 30, contactsFonts: 40 },
} as const;

/* --------------------------------- Schemas --------------------------------- */

const ResumeSchema = z.object({
  filename: z.string(),
  content: z.string(),
});

const RankResumesInputSchema = z.object({
  resumes: z.array(ResumeSchema).describe('Array of resumes to rank.'),
  jobDescription: z.string().describe('JD text used for evaluation.'),
  // Treat these as MUST-HAVE keywords if provided.
  jdKeywords: z.array(z.string()).optional().describe('Explicit JD keywords to check (treated as must-have).'),
});
export type RankResumesInput = z.infer<typeof RankResumesInputSchema>;

/** Raw 0–5 with short reason for a sub-parameter */
const SubMetricRawSchema = z.object({
  raw: z.number().min(0).max(5).describe('Score on a 0–5 scale for the sub-parameter.'),
  reason: z.string().describe('One-line justification.'),
});

/** Full matrix breakdown */
const ATSBreakdownSchema = z.object({
  skills: z.object({
    hard: SubMetricRawSchema,
    soft: SubMetricRawSchema,
    domain: SubMetricRawSchema,
  }),
  experience: z.object({
    eyoe: SubMetricRawSchema,
    roleSimilarity: SubMetricRawSchema,
    industry: SubMetricRawSchema,
  }),
  education: z.object({
    degree: SubMetricRawSchema,
    field: SubMetricRawSchema,
    relevance: SubMetricRawSchema,
  }),
  certifications: z.object({
    presence: SubMetricRawSchema,
    relevance: SubMetricRawSchema,
  }),
  achievements: z.object({
    relevance: SubMetricRawSchema,
  }),
  projectsImpact: z.object({
    presence: SubMetricRawSchema,
    relevance: SubMetricRawSchema,
  }),
  jdKeywords: z.object({
    mustHave: SubMetricRawSchema,
    jdAlignment: SubMetricRawSchema,
    niceToHave: SubMetricRawSchema,
  }),
  submissionQuality: z.object({
    atsFormatting: SubMetricRawSchema,
    readabilityParsing: SubMetricRawSchema,
    contactsFonts: SubMetricRawSchema,
  }),
});

/** Server-computed points per parameter and overall total */
const RankedResumeSchema = z.object({
  filename: z.string().describe('Resume filename.'),
  highlights: z.string().describe('Concise strengths and gaps.'),
  matchedKeywords: z.array(z.string()).describe('JD keywords found (exact/near-exact).'),
  missingKeywords: z.array(z.string()).describe('Important JD keywords not found.'),
  breakdown: ATSBreakdownSchema,
  // Parameter points after weighting sub-parameters server-side:
  points: z.object({
    skills: z.number(),
    experience: z.number(),
    education: z.number(),
    certifications: z.number(),
    achievements: z.number(),
    projectsImpact: z.number(),
    jdKeywords: z.number(),
    submissionQuality: z.number(),
  }),
  score: z.number().min(0).max(100).describe('Total score out of 100 after weighting.'),
});

const RankResumesOutputSchema = z.array(RankedResumeSchema);
export type RankResumesOutput = z.infer<typeof RankResumesOutputSchema>;

/* --------------------------------- Prompt ---------------------------------- */

const rankResumesATSPrompt = ai.definePrompt({
  name: 'rankResumesATSPrompt_vMatrix',
  input: { schema: RankResumesInputSchema },
  output: { schema: RankResumesOutputSchema }, // LLM must conform; server still recomputes points
  prompt: `
You are an expert ATS evaluator. Grade each resume against the JD using the MATRIX below.
Return ONLY a JSON array matching the output schema. Provide RAW 0–5 scores at the SUB-PARAMETER level.
Do NOT compute weights or totals. Keep "highlights" to 1–3 sentences.

IMPORTANT:
- For the "JD Keywords & Responsibilities" parameter, DO NOT invent matches/missing.
- Server will compute "matchedKeywords" and "missingKeywords" using a deterministic matcher.
- Use that perspective when assigning sub-raws (mustHave / jdAlignment / niceToHave), but still output your best judgment based on the resume + JD text.

MATRIX (RAW 0–5 at SUB-PARAMS; server weights later):
1) Skills (hard, soft, domain)
   - 5 = strongly aligned; 3 = partial; 0 = absent
2) Experience (eyoe, roleSimilarity, industry)
   - EYOE guide: 0–2 yrs → 1; 3–5 → 3; 6+ → 5; ±1 for strength (cap 0–5)
3) Education (degree, field, relevance)
4) Certifications (presence, relevance)
5) Achievements (relevance to JD; quantified > qualitative)
6) Projects/Impact (presence, relevance to JD; quantify impact if present)
7) JD Keywords & Responsibilities (mustHave, jdAlignment, niceToHave)
   - mustHave focuses on critical JD terms (or provided jdKeywords)
   - jdAlignment reflects how responsibilities/tasks align (not just keyword string match)
   - niceToHave covers peripheral/pluses
8) Submission Quality (atsFormatting, readabilityParsing, contactsFonts)

OUTPUT RULES:
- Output valid JSON ONLY.
- Provide concise "highlights".
- Provide RAW 0–5 for every sub-parameter listed above.
- Do NOT include weighted points or totals.

Job Description:
{{{jobDescription}}}

JD Keywords (treated as must-have if provided):
{{#if jdKeywords}}
- {{#each jdKeywords}}{{this}}
- {{/each}}
{{/if}}

Resumes:
{{#each resumes}}
---
Filename: {{this.filename}}
Content: {{{this.content}}}
---
{{/each}}
`,
});

/* ---------------------------------- Helpers -------------------------------- */

const clamp = (x: number, a = 0, b = 5) => Math.max(a, Math.min(b, x));

/** Sub-points: (raw/5) * (paramWeight * subWeight%) */
function computeSubPoints(raw: number, paramWeight: number, subPercent: number): number {
  const subWeight = (paramWeight * subPercent) / 100;
  return (clamp(raw) / 5) * subWeight;
}

/** Sum of sub-points for a parameter, rounded to nearest 0.1 then to 2 decimals */
function computeParamPoints(
  paramKey: MetricKey,
  paramBreakdown: Record<string, { raw: number }>
): number {
  const paramWeight = ATS_WEIGHTS[paramKey];
  const subs = SUB_WEIGHTS[paramKey];
  let total = 0;
  for (const [subKey, pct] of Object.entries(subs)) {
    const raw = paramBreakdown[subKey]?.raw ?? 0;
    total += computeSubPoints(raw, paramWeight, pct);
  }
  return Math.round(total * 10) / 10; // keep one decimal for fairness
}

/** Recompute all points and total score; clamp to [0,100] and round to integer total */
function recomputeAndRank(output: z.infer<typeof RankResumesOutputSchema>) {
  const withTotals = output.map(item => {
    const points: Record<MetricKey, number> = {
      skills: computeParamPoints('skills', item.breakdown.skills),
      experience: computeParamPoints('experience', item.breakdown.experience),
      education: computeParamPoints('education', item.breakdown.education),
      certifications: computeParamPoints('certifications', item.breakdown.certifications),
      achievements: computeParamPoints('achievements', item.breakdown.achievements),
      projectsImpact: computeParamPoints('projectsImpact', item.breakdown.projectsImpact),
      jdKeywords: computeParamPoints('jdKeywords', item.breakdown.jdKeywords),
      submissionQuality: computeParamPoints('submissionQuality', item.breakdown.submissionQuality),
    };

    const total =
      points.skills +
      points.experience +
      points.education +
      points.certifications +
      points.achievements +
      points.projectsImpact +
      points.jdKeywords +
      points.submissionQuality;

    return {
      ...item,
      points,
      score: Math.max(0, Math.min(100, Math.round(total))), // integer 0–100
    };
  });

  return withTotals.sort((a, b) => b.score - a.score);
}

/* ---------------------------------- Flow ----------------------------------- */

const rankResumesATSFlow = ai.defineFlow(
  {
    name: 'rankResumesATSFlow_vMatrix',
    inputSchema: RankResumesInputSchema,
    outputSchema: RankResumesOutputSchema,
  },
  async (input) => {
    // 1) Ask LLM for sub-param RAW scores + highlights (no weighting)
    const { output } = await rankResumesATSPrompt(input);
    const llmShaped = RankResumesOutputSchema.parse(output);

    // 2) Deterministic keyword matching for each resume (overrides LLM’s guess lists)
    const enriched = await Promise.all(
      llmShaped.map(async (item) => {
        const resume = input.resumes.find(r => r.filename === item.filename) ?? input.resumes[0];
        const kw = await matchKeywordsToResume({
          resumeText: resume.content,
          jobDescription: input.jobDescription,
        });

        return {
          ...item,
          matchedKeywords: kw.matches ?? [],
          missingKeywords: kw.missing ?? [],
        };
      })
    );

    // 3) Server-side recomputation: sub-weights → param points → total/100
    const ranked = recomputeAndRank(enriched);
    return ranked;
  }
);

export async function rankResumes(input: RankResumesInput): Promise<RankResumesOutput> {
  return rankResumesATSFlow(input);
}
