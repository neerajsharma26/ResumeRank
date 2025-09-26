'use server';
/**
 * ATS ranking with matrix-based rubric, Gemini-safe:
 *  - Minimal LLM output schema (per-resume) to avoid "too many states" 400
 *  - One LLM call per resume (aggregate on server)
 *  - Deterministic keyword matching injected server-side
 *  - ACCEPTS user weights; user controls 70%, defaults fill ~30% → final sum = 100
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { matchKeywordsToResume } from '@/ai/flows/match-keywords-to-resume';

/* ----------------------------- Config / Weights ----------------------------- */

const ATS_WEIGHTS = {
  skills: 25,
  experience: 25,
  education: 20,
  certifications: 5,
  achievements: 5,
  projectsImpact: 5,
  jdKeywords: 10,
  submissionQuality: 5,
} as const;

type MetricKey = keyof typeof ATS_WEIGHTS;

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

const WeightsSchema = z.object({
  skills: z.number().optional(),
  experience: z.number().optional(),
  education: z.number().optional(),
  certifications: z.number().optional(),
  achievements: z.number().optional(),
  projectsImpact: z.number().optional(),
  jdKeywords: z.number().optional(),
  submissionQuality: z.number().optional(),
});

const RankResumesInputSchema = z.object({
  resumes: z.array(ResumeSchema).min(1),
  jobDescription: z.string(),
  jdKeywords: z.array(z.string()).optional(), // (treated as must-have downstream if provided)
  weights: WeightsSchema.optional(),          // 👈 NEW: user-provided weights (any subset)
});
export type RankResumesInput = z.infer<typeof RankResumesInputSchema>;

/** Minimal per-sub score (no descriptions to reduce state space) */
const SubRawSchema = z.object({
  raw: z.number().int().min(0).max(5), // RAW 0..5 in this build
});

/** Fixed, shallow parameter schemas (no dynamic keys, no records) */
const SkillsSchema = z.object({ hard: SubRawSchema, soft: SubRawSchema, domain: SubRawSchema });
const ExperienceSchema = z.object({ eyoe: SubRawSchema, roleSimilarity: SubRawSchema, industry: SubRawSchema });
const EducationSchema = z.object({ degree: SubRawSchema, field: SubRawSchema, relevance: SubRawSchema });
const CertificationsSchema = z.object({ presence: SubRawSchema, relevance: SubRawSchema });
const AchievementsSchema = z.object({ relevance: SubRawSchema });
const ProjectsImpactSchema = z.object({ presence: SubRawSchema, relevance: SubRawSchema });
const JDKeywordsSchema = z.object({ mustHave: SubRawSchema, jdAlignment: SubRawSchema, niceToHave: SubRawSchema });
const SubmissionQualitySchema = z.object({
  atsFormatting: SubRawSchema,
  readabilityParsing: SubRawSchema,
  contactsFonts: SubRawSchema,
});

/** Minimal LLM output for one resume */
const LLMResumeEvalSchema = z.object({
  filename: z.string(),
  highlights: z.string(), // short text
  breakdown: z.object({
    skills: SkillsSchema,
    experience: ExperienceSchema,
    education: EducationSchema,
    certifications: CertificationsSchema,
    achievements: AchievementsSchema,
    projectsImpact: ProjectsImpactSchema,
    jdKeywords: JDKeywordsSchema,
    submissionQuality: SubmissionQualitySchema,
  }),
});

/** Final server output item (with computed points + keyword arrays) */
const RankedResumeSchema = z.object({
  filename: z.string(),
  highlights: z.string(),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  breakdown: LLMResumeEvalSchema.shape.breakdown, // reuse the structure
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
  score: z.number().min(0).max(100),
});

const RankResumesOutputSchema = z.array(RankedResumeSchema);
export type RankResumesOutput = z.infer<typeof RankResumesOutputSchema>;
export type RankResumesOutputItem = z.infer<typeof RankedResumeSchema>;

/* --------------------------------- Prompts --------------------------------- */
/** Per-resume evaluator with tiny schema to avoid 400 */
const perResumePrompt = ai.definePrompt({
  name: 'rankSingleResumeATSPrompt_vMatrixSlim',
  input: {
    schema: z.object({
      filename: z.string(),
      resumeContent: z.string(),
      jobDescription: z.string(),
      jdKeywords: z.array(z.string()).optional(),
    }),
  },
  output: { schema: LLMResumeEvalSchema },
  prompt: `
  You are an expert ATS evaluator. Evaluate ONE resume against ONE job description strictly using the texts provided.
  Return **JSON ONLY** that matches the schema enforced by the system (no extra keys, no prose).

  GLOBAL RULES
  - RAW scores are **integers 0..5** (no decimals).
  - Use only the JD and Resume below. **No external knowledge. No assumptions.**
  - If info is missing/ambiguous/unevidenced → score conservatively (lean low).
  - Do **not** output keyword lists; a separate system computes them.
  - Fill **every** sub-parameter; if truly absent set {"raw": 0}.
  - "highlights" = 1–3 factual sentences referencing resume evidence.
  - Output **valid JSON only** (no markdown, no commentary).

  SCORING ANCHORS (applies to all subs)
  - 0 Not present/contradicted/unverifiable
  - 1 Minimal hint (very weak, vague)
  - 2 Partial evidence (some relevance; gaps/generic)
  - 3 Solid but incomplete (good relevance; some misses)
  - 4 Strong (clear, specific, mostly covers requirements)
  - 5 Exceptional (explicit, comprehensive, quantified where applicable)

  MATRIX (sub-parameters WITH inline definitions)
  - skills:
  - - hard: JD core tools/methods/techniques explicitly shown in resume.
  - - soft: evidenced behaviors (leadership, communication, collaboration, problem-solving) with context.
  - - domain: domain/industry knowledge matching JD context (e.g., fintech, healthcare).

  - experience:
  - - eyoe: Estimated years from resume only. Bands → 0 none; 1 <1y; 2 = 1–2y; 3 = 3–5y; 4 = 6–8y; 5 = 9+y. If unclear, pick the **lower** plausible band.
  - - roleSimilarity: title/functions/scope/stack/seniority overlap with JD.
  - - industry: same or closely related industry > adjacent > unrelated.

  - education:
  - - degree: level vs JD expectation (Bachelor/Master/PhD). Count higher only if explicitly stated.
  - - field: discipline relevance to JD (e.g., CS/IT/Data > unrelated).
  - - relevance: specialization/coursework/capstone aligned to JD duties.

  - certifications:
  - - presence: required/preferred certs explicitly listed (vendor/name/ID if present).
  - - relevance: direct > adjacent > unrelated to JD.

  - achievements:
  - - relevance: outcome-oriented, JD-related results; quantified impact (%, $, time, accuracy) merits higher scores.

  - projectsImpact:
  - - presence: projects explicitly listed with role/ownership.
  - - relevance: technologies/objectives/outcomes align with JD; measured impact → higher.

  - jdKeywords (no keyword lists in output; use for scoring only):
  - - mustHave: degree of coverage for **critical** JD items (treat provided jdKeywords as critical).
  - - jdAlignment: how well responsibilities/tasks match JD (beyond string matching).
  - - niceToHave: coverage of peripheral/bonus items.

  - submissionQuality:
  - - atsFormatting: clear sections, bulleting, standard fonts; ATS-parsable layout.
  - - readabilityParsing: consistent labels/dates, minimal errors; machine-readable text (not images/scans).
  - - contactsFonts: complete contacts (email/phone/LinkedIn); legible, consistent fonts.

  EMIT JSON NOW

  Job Description:
  {{{jobDescription}}}

  Resume ({{filename}}):
  {{{resumeContent}}}`
});

/* ---------------------------------- Helpers -------------------------------- */

const clamp = (x: number, a = 0, b = 5) => Math.max(a, Math.min(b, x));

function computeSubPoints(raw: number, paramWeight: number, subPercent: number): number {
  const subWeight = (paramWeight * subPercent) / 100;
  return (clamp(raw) / 5) * subWeight; // RAW is 0..5 in this build
}

/** Now receives paramWeight & subWeights (instead of reading ATS_WEIGHTS inside) */
function computeParamPoints<T extends Record<string, { raw: number }>>(
  paramWeight: number,
  subWeights: Record<string, number>,
  paramBreakdown: T
): number {
  let total = 0;
  for (const [subKey, pct] of Object.entries(subWeights)) {
    const r = paramBreakdown?.[subKey]?.raw ?? 0;
    total += computeSubPoints(r, paramWeight, pct);
  }
  // one decimal for fairness
  return Math.round(total * 10) / 10;
}

/* -------------------------- Effective weights (70/30) ----------------------- */

type FullWeights = Record<MetricKey, number>;

function sumObj(obj: Partial<FullWeights>): number {
  return (Object.values(obj) as number[]).reduce((s, v) => s + (v ?? 0), 0);
}

// Normalize to 100 with 1-dec rounding; last key absorbs drift
function normalizeTo100(w: FullWeights): FullWeights {
  const total = sumObj(w) || 1;
  const factor = 100 / total;
  const scaled = Object.fromEntries(
    (Object.entries(w) as [MetricKey, number][]).map(([k, v]) => [k, v * factor])
  ) as FullWeights;

  const keys = Object.keys(scaled) as MetricKey[];
  const out: FullWeights = {} as FullWeights;
  let acc = 0;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) out[k] = Math.round((100 - acc) * 10) / 10;
    else {
      const r = Math.round(scaled[k] * 10) / 10;
      out[k] = r; acc += r;
    }
  });
  return out;
}

/**
 * User-provided weights (any subset) are normalized to sum = 70.
 * Remaining ≈30 is distributed by ATS_WEIGHTS defaults:
 *  - If user gave a subset → spread 30 across unspecified metrics only (by defaults).
 *  - If user gave all 8 → spread 30 across all 8 (by defaults).
 * Final result normalized to 100.
 */
function buildEffectiveWeights70(user?: Partial<FullWeights>): FullWeights {
  const defaults = { ...ATS_WEIGHTS };
  const allKeys = Object.keys(defaults) as MetricKey[];

  if (!user || Object.keys(user).length === 0) {
    return normalizeTo100(defaults);
  }

  const providedKeys = allKeys.filter(k => typeof user[k] === 'number');
  const userSum = providedKeys.reduce((s, k) => s + (user[k] as number), 0);

  // 1) User portion → normalized to 70
  const userPortion: FullWeights = allKeys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as FullWeights);
  if (userSum > 0) {
    for (const k of providedKeys) {
      userPortion[k] = ((user[k] as number) / userSum) * 70;
    }
  }

  // 2) Remaining (~30) → defaults
  const used = sumObj(userPortion);
  const remaining = Math.max(0, 100 - used);
  const fillSet =
    providedKeys.length === allKeys.length
      ? allKeys
      : allKeys.filter(k => !providedKeys.includes(k));

  const defSum = fillSet.reduce((s, k) => s + defaults[k], 0) || 1;
  const fill: Partial<FullWeights> = {};
  for (const k of fillSet) fill[k] = (defaults[k] / defSum) * remaining;

  // 3) Combine and normalize to exactly 100
  const combined: FullWeights = allKeys.reduce((acc, k) => {
    acc[k] = (userPortion[k] ?? 0) + (fill[k] ?? 0);
    return acc;
  }, {} as FullWeights);

  return normalizeTo100(combined);
}

/* ----------------------------- Scoring & Ranking ---------------------------- */

function recomputeAndRank(
  items: Array<z.infer<typeof RankedResumeSchema>>,
  effective: FullWeights
) {
  const ranked = items
    .map(it => {
      const points = {
        skills: computeParamPoints(effective.skills, SUB_WEIGHTS.skills, it.breakdown.skills),
        experience: computeParamPoints(effective.experience, SUB_WEIGHTS.experience, it.breakdown.experience),
        education: computeParamPoints(effective.education, SUB_WEIGHTS.education, it.breakdown.education),
        certifications: computeParamPoints(effective.certifications, SUB_WEIGHTS.certifications, it.breakdown.certifications),
        achievements: computeParamPoints(effective.achievements, SUB_WEIGHTS.achievements, it.breakdown.achievements),
        projectsImpact: computeParamPoints(effective.projectsImpact, SUB_WEIGHTS.projectsImpact, it.breakdown.projectsImpact),
        jdKeywords: computeParamPoints(effective.jdKeywords, SUB_WEIGHTS.jdKeywords, it.breakdown.jdKeywords),
        submissionQuality: computeParamPoints(effective.submissionQuality, SUB_WEIGHTS.submissionQuality, it.breakdown.submissionQuality),
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
        ...it,
        points,
        score: Math.max(0, Math.min(100, Math.round(total))), // clamp + int
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked;
}

/* ---------------------------------- Flow ----------------------------------- */

async function evaluateOneResume(
  jd: string,
  resume: z.infer<typeof ResumeSchema>,
  jdKeywords?: string[]
): Promise<RankResumesOutputItem> {
  // 1) Get RAW sub-scores from LLM with minimal schema
  const { output } = await perResumePrompt({
    filename: resume.filename,
    resumeContent: resume.content,
    jobDescription: jd,
    jdKeywords,
  });

  const llmEval = LLMResumeEvalSchema.parse(output);

  // 2) Deterministic keyword matching (overrides any LLM guesswork)
  const kw = await matchKeywordsToResume({
    resumeText: resume.content,
    jobDescription: jd,
  });

  // 3) Assemble partial; points & score are computed later
  const partial: RankResumesOutputItem = {
    filename: llmEval.filename,
    highlights: llmEval.highlights,
    matchedKeywords: kw.matches ?? [],
    missingKeywords: kw.missing ?? [],
    breakdown: llmEval.breakdown,
    points: {
      skills: 0, experience: 0, education: 0, certifications: 0,
      achievements: 0, projectsImpact: 0, jdKeywords: 0, submissionQuality: 0,
    },
    score: 0,
  };

  return partial;
}

export async function rankResumes(input: RankResumesInput): Promise<RankResumesOutput> {
  const parsed = RankResumesInputSchema.parse(input);

  // Process one-by-one to avoid huge state space in a single LLM call
  const partials: RankResumesOutputItem[] = [];
  for (const r of parsed.resumes) {
    try {
      const evaluated = await evaluateOneResume(parsed.jobDescription, r, parsed.jdKeywords);
      partials.push(evaluated);
    } catch (err) {
      // Fallback item on LLM failure (keeps pipeline moving)
      partials.push({
        filename: r.filename,
        highlights: 'Evaluation failed; partial output generated.',
        matchedKeywords: [],
        missingKeywords: [],
        breakdown: {
          skills: { hard: { raw: 0 }, soft: { raw: 0 }, domain: { raw: 0 } },
          experience: { eyoe: { raw: 0 }, roleSimilarity: { raw: 0 }, industry: { raw: 0 } },
          education: { degree: { raw: 0 }, field: { raw: 0 }, relevance: { raw: 0 } },
          certifications: { presence: { raw: 0 }, relevance: { raw: 0 } },
          achievements: { relevance: { raw: 0 } },
          projectsImpact: { presence: { raw: 0 }, relevance: { raw: 0 } },
          jdKeywords: { mustHave: { raw: 0 }, jdAlignment: { raw: 0 }, niceToHave: { raw: 0 } },
          submissionQuality: {
            atsFormatting: { raw: 0 },
            readabilityParsing: { raw: 0 },
            contactsFonts: { raw: 0 },
          },
        },
        points: {
          skills: 0, experience: 0, education: 0, certifications: 0,
          achievements: 0, projectsImpact: 0, jdKeywords: 0, submissionQuality: 0,
        },
        score: 0,
      });
    }
  }

  // ✅ Build effective weights from client input (user controls 70%, defaults fill ~30%)
  const effective = buildEffectiveWeights70(parsed.weights as Partial<FullWeights> | undefined);

  // ✅ Compute points & totals; then sort
  const ranked = recomputeAndRank(partials, effective);
  return RankResumesOutputSchema.parse(ranked);
}
