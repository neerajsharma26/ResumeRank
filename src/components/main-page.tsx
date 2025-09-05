'use client';

import * as React from 'react';
import { analyzeResumesAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import type { AnalysisResult, Resume } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';

import Header from '@/components/layout/header';
import ResultsView from '@/components/results-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import { FileUpload } from './file-upload';
import { WeightSliders, DEFAULT_WEIGHTS, MetricWeights } from './weight-sliders';
import { ComparisonModal } from './comparison-modal';
import { ResumeViewerModal } from './resume-viewer-modal';

export default function MainPage() {
  const [jobDescription, setJobDescription] = React.useState('');
  const [resumeFiles, setResumeFiles] = React.useState<File[]>([]);
  const [analysisResult, setAnalysisResult] = React.useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [weights, setWeights] = React.useState<MetricWeights>(DEFAULT_WEIGHTS);
  
  const [isComparisonModalOpen, setIsComparisonModalOpen] = React.useState(false);
  const [comparisonResults, setComparisonResults] = React.useState<AnalysisResult['rankedResumes']>([]);

  const [isViewerOpen, setIsViewerOpen] = React.useState(false);
  const [viewingIndex, setViewingIndex] = React.useState(0);

  const { toast } = useToast();
  const { user } = useAuth();
  
  const fileToResume = (file: File): Promise<Resume> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          resolve({
            filename: file.name,
            content: event.target.result,
          });
        } else {
          reject(new Error("Couldn't read file"));
        }
      };
      reader.onerror = () => reject(new Error("Error reading file"));
      reader.readAsText(file);
    });
  };

  const handleAnalyze = async () => {
    if (!user) {
       toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be signed in to analyze resumes.',
      });
      return;
    }
    if (!jobDescription.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please provide a job description.',
      });
      return;
    }
    if (resumeFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please upload at least one resume.',
      });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);

    try {
      const resumes = await Promise.all(resumeFiles.map(fileToResume));
      const result = await analyzeResumesAction(jobDescription, resumes, user.uid);
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

  const handleCompare = (filenames: string[]) => {
      if (!analysisResult) return;
      const selected = analysisResult.rankedResumes.filter(r => filenames.includes(r.filename));
      setComparisonResults(selected);
      setIsComparisonModalOpen(true);
  }

  const handleView = (filename: string) => {
    if (!analysisResult) return;
    const index = analysisResult.rankedResumes.findIndex(r => r.filename === filename);
    if(index > -1) {
        setViewingIndex(index);
        setIsViewerOpen(true);
    }
  }

  const viewingResult = analysisResult?.rankedResumes[viewingIndex];
  const viewingDetails = viewingResult ? analysisResult?.details[viewingResult.filename] : null;
  const viewingFile = viewingResult ? resumeFiles.find(f => f.name === viewingResult.filename) ?? null : null;


  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 xl:col-span-3">
                <div className="space-y-6 sticky top-24">
                    <FileUpload
                        title="Upload Resumes"
                        description="Select up to 15 resumes to analyze."
                        files={resumeFiles}
                        onFilesChange={setResumeFiles}
                        acceptedFiles=".pdf,.doc,.docx,.txt"
                        isMultiple={true}
                        disabled={isLoading}
                    />
                    <Card className="shadow-md">
                        <CardHeader>
                            <CardTitle>Job Description</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                id="job-description"
                                placeholder="Paste the job description here..."
                                value={jobDescription}
                                onChange={(e) => setJobDescription(e.target.value)}
                                className="min-h-[150px] text-sm"
                                disabled={isLoading}
                            />
                        </CardContent>
                    </Card>

                    <WeightSliders title="Adjust Scoring" weights={weights} onWeightsChange={setWeights} />

                    <Button
                    onClick={handleAnalyze}
                    disabled={isLoading || resumeFiles.length === 0 || !jobDescription}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
                    size="lg"
                    >
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isLoading ? 'Analyzing...' : `Rank ${resumeFiles.length} Resumes`}
                    </Button>
                </div>
            </div>

            <div className="lg:col-span-8 xl:col-span-9">
              <ResultsView 
                result={analysisResult} 
                isLoading={isLoading} 
                onCompare={handleCompare}
                onView={handleView}
                />
            </div>
          </div>
        </main>
      </div>
      {analysisResult && (
        <ComparisonModal 
            isOpen={isComparisonModalOpen}
            onClose={() => setIsComparisonModalOpen(false)}
            results={comparisonResults}
            details={analysisResult.details}
        />
      )}
      {isViewerOpen && viewingResult && viewingDetails && (
         <ResumeViewerModal
            isOpen={isViewerOpen}
            onClose={() => setIsViewerOpen(false)}
            result={viewingResult}
            details={viewingDetails}
            file={viewingFile}
            onNext={() => setViewingIndex(i => Math.min(i + 1, (analysisResult?.rankedResumes.length ?? 0) -1))}
            onPrev={() => setViewingIndex(i => Math.max(i - 1, 0))}
            hasNext={viewingIndex < (analysisResult?.rankedResumes.length ?? 0) - 1}
            hasPrev={viewingIndex > 0}
         />
      )}
    </>
  );
}
