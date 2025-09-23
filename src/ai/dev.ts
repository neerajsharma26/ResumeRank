import { config } from 'dotenv';
config();

import '@/ai/flows/parse-resume-skills.ts';
import '@/ai/flows/rank-resumes.ts';
import '@/ai/flows/match-keywords-to-resume.ts';
import '@/ai/flows/process-resume-v2.ts';
