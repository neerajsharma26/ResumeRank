'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import type { MetricWeights } from '@/lib/types';

interface WeightSlidersProps {
  weights: MetricWeights;
  onWeightsChange: (weights: MetricWeights) => void;
  disabled?: boolean;
}

const DEFAULT_WEIGHTS: MetricWeights = {
  skills: 8,
  experience: 10,
  education: 5,
};

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
            <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{value}</span>
        </div>
        <Slider
            value={[value]}
            onValueChange={onChange}
            min={0}
            max={10}
            step={1}
            disabled={disabled}
        />
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
);


export const WeightSliders: React.FC<WeightSlidersProps> = ({ weights, onWeightsChange, disabled }) => {
  const handleSliderChange = (metric: keyof MetricWeights) => (value: number[]) => {
    onWeightsChange({ ...weights, [metric]: value[0] });
  };
  
  const resetToDefault = () => {
    onWeightsChange(DEFAULT_WEIGHTS);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Analysis Weights</CardTitle>
            <CardDescription>Adjust the importance of each metric.</CardDescription>
          </div>
          <Button variant="ghost" onClick={resetToDefault} disabled={disabled}>Reset</Button>
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
