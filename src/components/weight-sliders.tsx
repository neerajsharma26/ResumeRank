'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import type { MetricWeights } from '@/lib/types';

interface WeightSlidersProps {
  weights: MetricWeights; // { skills: number; experience: number; education: number }
  onWeightsChange: (weights: MetricWeights) => void;
  disabled?: boolean;
}

const DEFAULT_WEIGHTS: MetricWeights = {
  skills: 35,
  experience: 35,
  education: 30,
};

const STEP = 5;

/* ------------------------------ helpers ------------------------------ */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundToStep(n: number, step = STEP) {
  return Math.round(n / step) * step;
}

/** Deterministic "other keys" mapping keeps TS narrow and safe */
const OTHER_KEYS: Record<keyof MetricWeights, [keyof MetricWeights, keyof MetricWeights]> = {
  skills: ['experience', 'education'],
  experience: ['skills', 'education'],
  education: ['skills', 'experience'],
};

/**
 * Rebalance so skills + experience + education === 100.
 * - Fix the changed metric to newVal (clamped & step-rounded).
 * - Distribute the remainder across the other two proportionally to their current shares.
 * - Resolve rounding residue to keep exact 100 while preserving STEP multiples.
 */
function rebalance3(
  curr: MetricWeights,
  changedKey: keyof MetricWeights,
  rawNewVal: number
): MetricWeights {
  // 1) Fix changed value
  let newVal = roundToStep(clamp(rawNewVal, 0, 100));

  // 2) Determine the other two keys (typed)
  const [kA, kB] = OTHER_KEYS[changedKey];

  // 3) Remaining for the other two
  const remaining = clamp(100 - newVal, 0, 100);

  // 4) Proportional allocation
  const a0 = curr[kA];
  const b0 = curr[kB];
  const denom = a0 + b0;

  let a: number;
  let b: number;

  if (denom === 0) {
    // even split if both are zero
    a = roundToStep(remaining / 2);
    b = remaining - a; // exact remainder keeps total == 100
  } else {
    const aTarget = (a0 / denom) * remaining;
    a = roundToStep(aTarget);
    b = remaining - a; // exact remainder
  }

  // 5) Bounds
  a = clamp(a, 0, 100);
  b = clamp(b, 0, 100);

  // 6) Correct any drift (should be multiples of STEP already)
  let total = newVal + a + b;
  if (total !== 100) {
    const diff = 100 - total; // could be ±
    if (diff !== 0) {
      if (diff > 0) {
        // add where there's headroom
        const roomA = 100 - a;
        const roomB = 100 - b;
        if (roomA >= roomB && roomA >= STEP) a += diff;
        else if (roomB >= STEP) b += diff;
        else newVal += diff;
      } else {
        // subtract where there's more weight
        if (a >= b && a >= STEP) a += diff; // diff negative
        else if (b >= STEP) b += diff;
        else newVal += diff;
      }
    }
  }

  // 7) Build next object with precise keys (no computed-key widening)
  const next: MetricWeights = { skills: 0, experience: 0, education: 0 };
  next[changedKey] = newVal;
  next[kA] = a;
  next[kB] = b;

  return next;
}

/* ---------------------------- presentational ---------------------------- */

const WeightSlider: React.FC<{
  label: string;
  value: number;
  description: string;
  onChange: (value: number[]) => void;
  disabled?: boolean;
}> = ({ label, value, description, onChange, disabled }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <label className="block text-sm font-medium">{label}</label>
      <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
        {value}
      </span>
    </div>
    <Slider
      value={[value]}
      onValueChange={onChange}
      min={0}
      max={100}
      step={STEP}
      disabled={disabled}
    />
    <p className="text-xs text-muted-foreground mt-1">{description}</p>
  </div>
);

/* ------------------------------ main export ------------------------------ */

export const WeightSliders: React.FC<WeightSlidersProps> = ({
  weights,
  onWeightsChange,
  disabled,
}) => {
  const handleSliderChange = (metric: keyof MetricWeights) => (value: number[]) => {
    const newWeights = rebalance3(weights, metric, value[0]);
    onWeightsChange(newWeights);
  };

  const resetToDefault = () => onWeightsChange(DEFAULT_WEIGHTS);

  const total = weights.skills + weights.experience + weights.education;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Analysis Weights</CardTitle>
            <CardDescription>
              Adjust the importance of each metric. (Total: {total})
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={resetToDefault} disabled={disabled}>
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <WeightSlider
          label="Skills Match"
          value={weights.skills}
          onChange={handleSliderChange('skills')}
          description="Importance of skill alignment."
          disabled={disabled}
        />
        <WeightSlider
          label="Experience Relevance"
          value={weights.experience}
          onChange={handleSliderChange('experience')}
          description="Importance of relevant work experience."
          disabled={disabled}
        />
        <WeightSlider
          label="Education Background"
          value={weights.education}
          onChange={handleSliderChange('education')}
          description="Importance of educational qualifications."
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
};
