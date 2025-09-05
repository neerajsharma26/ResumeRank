'use client';

import type { AnalysisResult } from '@/lib/types';
import CandidateCard from '@/components/candidate-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Users, Columns, ExternalLink } from 'lucide-react';
import React from 'react';

interface ResultsViewProps {
  result: AnalysisResult | null;
  isLoading: boolean;
  onCompare: (filenames: string[]) => void;
  onView: (filename: string) => void;
}

const ResultSkeleton = () => (
  <div className="space-y-4">
    {[...Array(3)].map((_, i) => (
      <Card key={i}>
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const EmptyState = () => (
  <Card className="flex items-center justify-center min-h-[50vh] shadow-none border-dashed">
    <div className="text-center text-muted-foreground">
      <Users className="mx-auto h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">Ready for Analysis</h3>
      <p className="mt-2 text-sm">
        Your ranked candidates will appear here once the analysis is complete.
      </p>
    </div>
  </Card>
);

export default function ResultsView({ result, isLoading, onCompare, onView }: ResultsViewProps) {
  const [selectedForCompare, setSelectedForCompare] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    // Clear selection when results change
    setSelectedForCompare(new Set());
  }, [result]);

  const handleCompareSelect = (filename: string, isSelected: boolean) => {
    const newSelectionSet = new Set(selectedForCompare);
    if (isSelected) {
      if (newSelectionSet.size < 3) {
        newSelectionSet.add(filename);
      }
    } else {
      newSelectionSet.delete(filename);
    }
    setSelectedForCompare(newSelectionSet);
  };

  const generateSummaryText = () => {
    if (!result) return '';
    let summary = `ResumeRank Analysis Summary\n`;
    summary += `============================\n\n`;

    result.rankedResumes.forEach((candidate) => {
      summary += `CANDIDATE: ${candidate.filename}\n`;
      summary += `-------------------------\n`;
      summary += `Score: ${candidate.score}/100\n`;
      summary += `AI Highlights: ${candidate.highlights}\n\n`;

      const details = result.details[candidate.filename];
      if (details) {
        summary += `--- Detailed Analysis ---\n`;
        summary += `Years of Experience: ${details.skills.experienceYears}\n`;
        summary += `Skills: ${details.skills.skills.join(', ') || 'None'}\n`;
        summary += `Certifications: ${details.skills.certifications.join(', ') || 'None'}\n\n`;
        
        summary += `Keyword Match Score: ${details.keywords.score}/100\n`;
        summary += `Keyword Summary: ${details.keywords.summary}\n`;
        summary += `Matched Keywords: ${details.keywords.matches.join(', ') || 'None'}\n`;
        summary += `Missing Keywords: ${details.keywords.missing.join(', ') || 'None'}\n`;
      }
      summary += `\n============================\n\n`;
    });
    return summary;
  };

  const downloadSummary = () => {
    const text = generateSummaryText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resumerank_summary.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canCompare = selectedForCompare.size >= 2 && selectedForCompare.size <= 3;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Analysis Results</h2>
        {result && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onCompare(Array.from(selectedForCompare))}
              disabled={!canCompare}
            >
              <Columns className="mr-2 h-4 w-4" />
              Compare ({selectedForCompare.size})
            </Button>
            <Button variant="outline" onClick={downloadSummary}>
              <Download className="mr-2 h-4 w-4" />
              Download Summary
            </Button>
          </div>
        )}
      </div>

      {isLoading && <ResultSkeleton />}

      {!isLoading && !result && <EmptyState />}

      {!isLoading && result && (
        <div className="space-y-4">
          {result.rankedResumes.map((rankedResume, index) => (
            <div key={rankedResume.filename} className="flex items-center gap-4">
                <Checkbox
                    id={`compare-${rankedResume.filename}`}
                    checked={selectedForCompare.has(rankedResume.filename)}
                    onCheckedChange={(checked) => handleCompareSelect(rankedResume.filename, !!checked)}
                    disabled={selectedForCompare.size >= 3 && !selectedForCompare.has(rankedResume.filename)}
                />
                <div className="flex-1">
                    <CandidateCard
                        rank={index + 1}
                        rankedResume={rankedResume}
                        details={result.details[rankedResume.filename]}
                    />
                </div>
                 <Button variant="ghost" size="icon" onClick={() => onView(rankedResume.filename)}>
                    <ExternalLink className="h-5 w-5" />
                </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
