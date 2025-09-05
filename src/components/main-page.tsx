'use client';

import * as React from 'react';
import { analyzeResumesAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import type { AnalysisResult, Resume, MetricWeights } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import type * as PdfJs from 'pdfjs-dist';

import Header from '@/components/layout/header';
import ResultsView from '@/components/results-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { FileUpload } from './file-upload';
import { ComparisonModal } from './comparison-modal';
import { ResumeViewerModal } from './resume-viewer-modal';
import { WeightSliders } from './weight-sliders';
import type { Report } from '@/app/page';

// Dynamically import pdfjs-dist only on the client side
const pdfjsLibPromise = import('pdfjs-dist');
let pdfjsLib: typeof PdfJs | null = null;
pdfjsLibPromise.then(lib => {
  pdfjsLib = lib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;
});

const DEFAULT_WEIGHTS: MetricWeights = {
  skills: 8,
  experience: 10,
  education: 5,
};

interface MainPageProps {
  onBack: () => void;
  existingResult?: Report;
}

export default function MainPage({ onBack, existingResult }: MainPageProps) {
  const [jobDescription, setJobDescription] = React.useState(existingResult?.jobDescription || '');
  const [jobDescriptionFile, setJobDescriptionFile] = React.useState<File[]>([]);
  const [resumeFiles, setResumeFiles] = React.useState<File[]>([]);
  const [weights, setWeights] = React.useState<MetricWeights>(DEFAULT_WEIGHTS);
  const [analysisResult, setAnalysisResult] = React.useState<AnalysisResult | null>(existingResult || null);
  const [isLoading, setIsLoading] = React.useState(false);
  
  const [isComparisonModalOpen, setIsComparisonModalOpen] = React.useState(false);
  const [comparisonResults, setComparisonResults] = React.useState<AnalysisResult['rankedResumes']>([]);

  const [isViewerOpen, setIsViewerOpen] = React.useState(false);
  const [viewingIndex, setViewingIndex] = React.useState(0);

  const { toast } = useToast();
  const { user } = useAuth();

  const isViewingPastReport = !!existingResult;
  
  const fileToText = async (file: File): Promise<string> => {
    if (!pdfjsLib) {
      // Wait for the library to load
      pdfjsLib = await pdfjsLibPromise;
    }
      
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let textContent = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        textContent += text.items.map(s => (s as any).str).join(' ');
      }
      return textContent;
    } else {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && typeof event.target.result === 'string') {
            resolve(event.target.result);
          } else {
            reject(new Error("Couldn't read file"));
          }
        };
        reader.onerror = () => reject(new Error("Error reading file"));
        reader.readAsText(file);
      });
    }
  };

  const fileToResume = async (file: File): Promise<Resume> => {
    const content = await fileToText(file);
    return { filename: file.name, content };
  };

  const handleAnalyze = async () => {
    if (!user?.uid) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to analyze resumes.',
        variant: 'destructive',
      });
      return;
    }

    if (resumeFiles.length === 0) {
      toast({ title: 'No Resumes', description: 'Please upload at least one resume.', variant: 'destructive' });
      return;
    }
    
    let currentJobDescription = jobDescription;
    if (jobDescriptionFile.length > 0) {
      try {
        currentJobDescription = await fileToText(jobDescriptionFile[0]);
      } catch (error) {
        toast({ title: 'Error Reading Job Description', description: 'Could not read the provided file.', variant: 'destructive' });
        return;
      }
    }
    
    if (!currentJobDescription.trim()) {
      toast({ title: 'No Job Description', description: 'Please type or upload a job description.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);

    try {
      const resumes = await Promise.all(resumeFiles.map(fileToResume));
      const result = await analyzeResumesAction(currentJobDescription, resumes, weights, user.uid);
      setAnalysisResult(result);
    } catch (e: any) {
      console.error(e);
      toast({
        title: 'Analysis Failed',
        description: e.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleComparison = (filenames: string[]) => {
    if (!analysisResult) return;
    const selectedResults = analysisResult.rankedResumes.filter(r => filenames.includes(r.filename));
    setComparisonResults(selectedResults);
    setIsComparisonModalOpen(true);
  };
  
  const handleView = (filename: string) => {
    if (!analysisResult) return;
    const index = analysisResult.rankedResumes.findIndex(r => r.filename === filename);
    if(index !== -1) {
      setViewingIndex(index);
      setIsViewerOpen(true);
    }
  };

  const currentResult = analysisResult?.rankedResumes[viewingIndex];
  // In a past report, we don't have the original File object, so currentFile will be null.
  const currentFile = isViewingPastReport ? null : (currentResult ? resumeFiles.find(f => f.name === currentResult.filename) || null : null);


  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        <div className="mb-8">
            <Button variant="ghost" onClick={onBack} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Button>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
             {isViewingPastReport ? 'Analysis Report' : 'AI Resume Analysis'}
            </h1>
            <p className="mt-2 text-lg text-slate-600">
              {isViewingPastReport
                ? 'Reviewing a previously generated analysis report.'
                : 'Upload a job description and resumes to get an AI-powered analysis and ranking.'
              }
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {!isViewingPastReport && (
            <div className="lg:col-span-1 flex flex-col gap-8">
              <Card>
                  <CardHeader>
                      <CardTitle>1. Job Description</CardTitle>
                      <CardDescription>Upload a file or paste the text.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <FileUpload 
                          title=""
                          description=""
                          onFilesChange={setJobDescriptionFile}
                          acceptedFiles=".pdf,.txt"
                          isMultiple={false}
                          files={jobDescriptionFile}
                          disabled={isLoading}
                      />
                      <div className="flex items-center">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                      </div>
                      <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="Paste job description here..."
                        className="w-full p-2 border rounded-md min-h-[150px] text-sm"
                        disabled={isLoading}
                      />
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                      <CardTitle>2. Upload Resumes</CardTitle>
                      <CardDescription>Select up to 15 PDF or TXT files.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <FileUpload
                        title=""
                        description=""
                        onFilesChange={setResumeFiles}
                        acceptedFiles=".pdf,.txt"
                        isMultiple={true}
                        files={resumeFiles}
                        disabled={isLoading}
                      />
                  </CardContent>
              </Card>

              <WeightSliders 
                weights={weights}
                onWeightsChange={setWeights}
                disabled={isLoading}
              />

              <Card>
                  <CardHeader>
                      <CardTitle>3. Start Analysis</CardTitle>
                      <CardDescription>Click the button to rank the resumes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Button onClick={handleAnalyze} disabled={isLoading || resumeFiles.length === 0} className="w-full" size="lg">
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-5 w-5" />
                            Rank Resumes
                          </>
                        )}
                      </Button>
                  </CardContent>
              </Card>
            </div>
          )}

          <div className={isViewingPastReport ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <ResultsView 
              result={analysisResult} 
              isLoading={isLoading} 
              onCompare={handleComparison}
              onView={handleView}
              jobDescriptionName={jobDescriptionFile[0]?.name || (jobDescription ? (jobDescription.substring(0, 50) + (jobDescription.length > 50 ? '...' : '')) : undefined)}
              isViewingPastReport={isViewingPastReport}
            />
          </div>
        </div>
      </main>

      {analysisResult && isComparisonModalOpen && (
        <ComparisonModal 
            isOpen={isComparisonModalOpen}
            onClose={() => setIsComparisonModalOpen(false)}
            results={comparisonResults}
            details={analysisResult.details}
        />
      )}
      
      {analysisResult && isViewerOpen && currentResult && (
         <ResumeViewerModal
            isOpen={isViewerOpen}
            onClose={() => setIsViewerOpen(false)}
            result={currentResult}
            details={analysisResult.details[currentResult.filename]}
            file={currentFile}
            onNext={() => setViewingIndex(i => (i + 1) % analysisResult.rankedResumes.length)}
            onPrev={() => setViewingIndex(i => (i - 1 + analysisResult.rankedResumes.length) % analysisResult.rankedResumes.length)}
            hasNext={viewingIndex < analysisResult.rankedResumes.length - 1}
            hasPrev={viewingIndex > 0}
        />
      )}
    </div>
  );
}
