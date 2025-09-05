'use client';
import React from 'react';

export type MetricWeights = {
    skills: number;
    experience: number;
    education: number;
};

export const DEFAULT_WEIGHTS: MetricWeights = {
    skills: 8,
    experience: 9,
    education: 4,
};


interface WeightSlidersProps {
  title: string;
  weights: MetricWeights;
  onWeightsChange: (weights: MetricWeights) => void;
}

const Slider: React.FC<{
    label: string;
    value: number;
    description: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, value, description, onChange }) => (
    <div>
        <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-slate-700">{label}</label>
            <span className="text-sm font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{value}</span>
        </div>
        <input
            type="range"
            min="0"
            max="10"
            value={value}
            onChange={onChange}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
);


export const WeightSliders: React.FC<WeightSlidersProps> = ({ title, weights, onWeightsChange }) => {
  const handleSliderChange = (metric: keyof MetricWeights) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onWeightsChange({ ...weights, [metric]: Number(e.target.value) });
  };
  
  const resetToDefault = () => {
    onWeightsChange(DEFAULT_WEIGHTS);
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
        <div className="flex justify-between items-center mb-4">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">{title}</h2>
                <p className="text-sm text-slate-500">Adjust the importance of each metric.</p>
            </div>
            <button onClick={resetToDefault} className="text-sm font-medium text-blue-600 hover:text-blue-800">Reset</button>
        </div>
      <div className="space-y-6">
        <Slider
          label="Skills Match"
          value={weights.skills}
          onChange={handleSliderChange('skills')}
          description="Importance of skill alignment."
        />
        <Slider
          label="Experience Relevance"
          value={weights.experience}
          onChange={handleSliderChange('experience')}
          description="Importance of relevant work experience."
        />
        <Slider
          label="Education Background"
          value={weights.education}
          onChange={handleSliderChange('education')}
          description="Importance of educational qualifications."
        />
      </div>
    </div>
  );
};
