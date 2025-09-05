'use client';

import * as React from 'react';
import { analyzeResumesAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import type { AnalysisResult, Resume } from '@/lib/types';
import { mockResumes } from '@/lib/mock-data';
import { useAuth } from '@/hooks/use-auth';

import Header from '@/components/layout/header';
import ResumeSelector from '@/components/resume-selector';
import ResultsView from '@/components/results-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';

export default function MainPage() {
  const [jobDescription, setJobDescription] = React.useState('');
  const [selectedResumes, setSelectedResumes] = React.useState<Resume[]>([]);
  const [analysisResult, setAnalysisResult] = React.useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please provide a job description.',
      });
      return;
    }
    if (selectedResumes.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select at least one resume.',
      });
      return;
    }
    if (!user) {
       toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to perform analysis.',
      });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);

    try {
      const result = await analyzeResumesAction(jobDescription, selectedResumes, user.uid);
      setAnalysisResult(result);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: error.message || 'An unknown error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 xl:col-span-3">
            <Card className="sticky top-24 shadow-md">
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Enter job details and select resumes to analyze.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="job-description">Job Description</Label>
                  <Textarea
                    id="job-description"
                    placeholder="Paste the job description here..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="min-h-[200px] text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-4">
                  <Label>Candidate Resumes</Label>
                  <ResumeSelector
                    resumes={mockResumes}
                    onSelectionChange={setSelectedResumes}
                    disabled={isLoading}
                  />
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
                  size="lg"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {isLoading ? 'Analyzing...' : 'Rank Resumes'}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8 xl:col-span-9">
            <ResultsView result={analysisResult} isLoading={isLoading} />
          </div>
        </div>
      </main>
    </div>
  );
}
