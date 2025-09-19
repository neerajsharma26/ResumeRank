'use client';

import * as React from 'react';
import { analyzeResumesAction, Report } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import type { AnalysisResult, Resume, MetricWeights, CandidateStatus } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import type * as PdfJs from 'pdfjs-dist';

import Header from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Sparkles, ArrowLeft, Upload, FileText, X, CheckCircle, Sliders, Play, Briefcase, Calendar, Clock, Users, Eye, Replace, FileX, MoreVertical, Trash2, Check, Inbox } from 'lucide-react';
import { ComparisonModal } from './comparison-modal';
import { ResumeViewerModal } from './resume-viewer-modal';
import { WeightSliders } from './weight-sliders';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDistanceToNow } from 'date-fns';
import { Checkbox } from './ui/checkbox';
import CandidateCard from './candidate-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { updateAnalysisReportStatus } from '@/app/actions';

const pdfjsLibPromise = import('pdfjs-dist');
let pdfjsLib: typeof PdfJs | null = null;
pdfjsLibPromise.then(lib => {
  pdfjsLib = lib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;
  }
});

const DEFAULT_WEIGHTS: MetricWeights = {
  skills: 8,
  experience: 10,
  education: 5,
};

interface MainPageProps {
  onBack: () => void;
  existingResult?: Report | null;
  onAnalysisComplete: (report: Report) => void;
}

const EmptyState = ({isFiltered = false}: {isFiltered?: boolean}) => (
  <Card className="flex items-center justify-center min-h-[40vh] shadow-none border-dashed">
    <div className="text-center text-muted-foreground">
      {isFiltered ? <Inbox className="mx-auto h-12 w-12" /> : <Users className="mx-auto h-12 w-12" />}
      <h3 className="mt-4 text-lg font-semibold">{isFiltered ? "No Candidates Found" : "Ready for Analysis"}</h3>
      <p className="mt-2 text-sm max-w-xs mx-auto">
        {isFiltered ? "There are no candidates matching the current filters." : "Your ranked candidates will appear here once the analysis is complete."}
      </p>
    </div>
  </Card>
);


export default function MainPage({ onBack, existingResult, onAnalysisComplete }: MainPageProps) {
  const [jobDescription, setJobDescription] = React.useState(existingResult?.jobDescription || 'Default Job Description');
  const [jobDescriptionFile, setJobDescriptionFile] = React.useState<File[]>([]);
  const [resumeFiles, setResumeFiles] = React.useState<File[]>([]);
  const [weights, setWeights] = React.useState<MetricWeights>(DEFAULT_WEIGHTS);
  const [isLoading, setIsLoading] = React.useState(false);
  
  const [isComparisonModalOpen, setIsComparisonModalOpen] = React.useState(false);
  const [comparisonResults, setComparisonResults] = React.useState<AnalysisResult['rankedResumes']>([]);

  const [isViewerOpen, setIsViewerOpen] = React.useState(false);
  const [viewingIndex, setViewingIndex] = React.useState(0);
  
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isJdDragOver, setIsJdDragOver] = React.useState(false);
  const resumeFileInputRef = React.useRef<HTMLInputElement>(null);
  const jdFileInputRef = React.useRef<HTMLInputElement>(null);


  const { toast } = useToast();
  const { user } = useAuth();
  
  const [selectedForCompare, setSelectedForCompare] = React.useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = React.useState<"all" | "shortlisted" | "rejected">('all');
  const [candidateStatuses, setCandidateStatuses] = React.useState<Record<string, CandidateStatus>>({});

  const isViewingPastReport = !!existingResult;
  const analysisResult = existingResult;

  React.useEffect(() => {
    setSelectedForCompare(new Set());
    if (analysisResult) {
        setCandidateStatuses(analysisResult.statuses || {});
    }
  }, [analysisResult]);
  
  const handleStatusChange = async (filename: string, status: CandidateStatus) => {
      const newStatuses = { ...candidateStatuses, [filename]: status };
      setCandidateStatuses(newStatuses);

      if (analysisResult?.id && user?.uid) {
          try {
              await updateAnalysisReportStatus(user.uid, analysisResult.id, newStatuses);
          } catch(e: any) {
              toast({ title: 'Error Saving Status', description: e.message, variant: 'destructive' });
              // Revert state if API call fails
              setCandidateStatuses(candidateStatuses);
          }
      }
  }
  
  const fileToText = async (file: File): Promise<string> => {
    if (!pdfjsLib) {
      pdfjsLib = await pdfjsLibPromise;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;
      }
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

    try {
      const resumes = await Promise.all(resumeFiles.map(fileToResume));
      const filesForUpload = await Promise.all(
        [...resumeFiles, ...jobDescriptionFile].map(async (file) => ({
          filename: file.name,
          data: await file.arrayBuffer(),
        }))
      );

      const report = await analyzeResumesAction(currentJobDescription, resumes, weights, user.uid, filesForUpload);
      onAnalysisComplete(report);
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

  const currentRankedResult = analysisResult?.rankedResumes[viewingIndex];
  const currentResume = analysisResult?.resumes.find(r => r.filename === currentRankedResult?.filename);
  const currentFile = isViewingPastReport ? null : (currentRankedResult ? resumeFiles.find(f => f.name === currentRankedResult.filename) || null : null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleResumeUpload = (files: FileList | null) => {
    if (!files) return;
    if (resumeFiles.length + files.length > 15) {
      toast({ title: 'Upload Limit Exceeded', description: 'You can upload a maximum of 15 resume files.', variant: 'destructive'});
      return;
    }
    const newFiles = Array.from(files).filter(file => {
      const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
      if (!allowedTypes.includes(file.type)) {
        toast({ title: 'Invalid File Type', description: `${file.name} is not a supported file type.`, variant: 'destructive'});
        return false;
      }
      if (file.size > 3 * 1024 * 1024) {
        toast({ title: 'File Too Large', description: `${file.name} is larger than 3MB.`, variant: 'destructive'});
        return false;
      }
      return true;
    });

    setResumeFiles(prev => [...prev, ...newFiles]);
  };

  const handleJdUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
     const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
     if (!allowedTypes.includes(file.type)) {
        toast({ title: 'Invalid File Type', description: `Only PDF, TXT, or DOC/DOCX files are allowed for the job description.`, variant: 'destructive'});
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        toast({ title: 'File Too Large', description: `Job description file must be smaller than 3MB.`, variant: 'destructive'});
        return;
      }
    setJobDescriptionFile([file]);
  };
  
  const removeResumeFile = (index: number) => {
    setResumeFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeJdFile = () => {
    setJobDescriptionFile([]);
  };

  const canAnalyze = !isLoading && resumeFiles.length > 0 && (jobDescriptionFile.length > 0 || jobDescription.trim().length > 0);
  
  const filteredResumes = React.useMemo(() => {
    if (!analysisResult) return [];
    if (activeTab === 'all') return analysisResult.rankedResumes;
    return analysisResult.rankedResumes.filter(r => candidateStatuses[r.filename] === activeTab);
  }, [analysisResult, activeTab, candidateStatuses]);

  const handleCompareSelect = (filename: string, isSelected: boolean) => {
    const newSelectionSet = new Set(selectedForCompare);
    if (isSelected) {
      if (newSelectionSet.size < 3) {
        newSelectionSet.add(filename);
      } else {
        toast({ title: 'Comparison Limit', description: 'You can only compare up to 3 candidates at a time.', variant: 'destructive'})
      }
    } else {
      newSelectionSet.delete(filename);
    }
    setSelectedForCompare(newSelectionSet);
  };
  
  const jdFile = analysisResult?.resumes.find(r => r.filename === (jobDescriptionFile[0]?.name));


  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        
        {isViewingPastReport && analysisResult ? (
          <div className="space-y-8">
            <Button variant="ghost" onClick={onBack} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Button>
             <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2 font-['Bitter']">
                {analysisResult.jobDescription.split('\n')[0] || "Analysis Report"}
              </h2>
            </div>

            <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    Job Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {jdFile ? (
                     <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-800">
                              {jdFile.filename}
                            </h4>
                          </div>
                        </div>

                        <div className="flex gap-2">
                           <a href={jdFile.url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                           </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans max-h-48 overflow-y-auto">
                        {analysisResult.jobDescription}
                      </pre>
                    </div>
                  )}
                </CardContent>
            </Card>
            
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "all" | "shortlisted" | "rejected")}>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-gray-800">
                    Candidate Results ({filteredResumes.length})
                  </h3>
                  <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="shortlisted">Shortlisted</TabsTrigger>
                      <TabsTrigger value="rejected">Rejected</TabsTrigger>
                  </TabsList>
              </div>
              <TabsContent value={activeTab}>
                {isLoading && <p>Loading...</p>}
                {!isLoading && filteredResumes.length === 0 && <EmptyState isFiltered />}
                {!isLoading && filteredResumes.length > 0 && (
                  <div className="space-y-4">
                  {filteredResumes.map((rankedResume) => (
                      <div key={rankedResume.filename} className="flex items-center gap-4">
                          <Checkbox
                              id={`compare-${rankedResume.filename}`}
                              checked={selectedForCompare.has(rankedResume.filename)}
                              onCheckedChange={(checked) => handleCompareSelect(rankedResume.filename, !!checked)}
                              disabled={selectedForCompare.size >= 3 && !selectedForCompare.has(rankedResume.filename)}
                          />
                          <div className="flex-1">
                              <CandidateCard
                                  rank={analysisResult.rankedResumes.findIndex(r => r.filename === rankedResume.filename) + 1}
                                  rankedResume={rankedResume}
                                  details={analysisResult.details[rankedResume.filename]}
                                  status={candidateStatuses[rankedResume.filename] || 'none'}
                                  onStatusChange={(newStatus) => handleStatusChange(rankedResume.filename, newStatus)}
                              />
                          </div>
                           <Button variant="ghost" size="icon" onClick={() => handleView(rankedResume.filename)}>
                              <Eye className="h-5 w-5" />
                          </Button>
                      </div>
                  ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-black mb-2 font-['Bitter']">Upload & Configure Analysis</h2>
              <p className="text-lg text-gray-600 mb-4">
                Upload resumes and configure your analysis settings
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
               <Card className="bg-[rgba(194,194,235,0.1)] shadow-sm">
                 <CardHeader className="bg-[rgba(194,194,235,1)]">
                   <CardTitle className="flex items-center gap-2">
                     <Upload className="w-5 h-5 text-blue-600" />
                     Upload Resumes
                   </CardTitle>
                   <CardDescription className="text-gray-700">
                     Upload up to 15 PDF, TXT or DOC/DOCX files (max 3MB each)
                   </CardDescription>
                 </CardHeader>
                 <CardContent className="p-6 space-y-4">
                   <div
                     className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
                       isDragOver 
                         ? 'border-blue-400 bg-blue-50' 
                         : 'border-gray-300 hover:border-gray-400'
                     }`}
                     onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleResumeUpload(e.dataTransfer.files); }}
                     onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                     onDragLeave={() => setIsDragOver(false)}
                     onClick={() => resumeFileInputRef.current?.click()}
                   >
                     <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                     <p className="text-sm font-medium text-gray-700 mb-1">
                       Drop files here or click to browse
                     </p>
                     <p className="text-xs text-gray-500">
                       PDF, TXT, DOC/DOCX up to 3MB each
                     </p>
                     <input
                       ref={resumeFileInputRef}
                       type="file"
                       multiple
                       accept=".pdf,.txt,.doc,.docx"
                       className="hidden"
                       onChange={(e) => handleResumeUpload(e.target.files)}
                     />
                   </div>

                   <div className="flex items-center justify-between text-sm">
                     <span className="text-gray-600">Files uploaded:</span>
                     <span className={`font-medium ${resumeFiles.length > 15 ? 'text-red-600' : 'text-gray-800'}`}>
                       {resumeFiles.length}/15
                     </span>
                   </div>

                   {resumeFiles.length > 0 && (
                     <div className="space-y-2 max-h-64 overflow-y-auto p-1">
                       {resumeFiles.map((file, index) => (
                         <div
                           key={`${file.name}-${index}`}
                           className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                         >
                           <div className="flex items-center gap-2 flex-1 min-w-0">
                             <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                             <div className="min-w-0 flex-1">
                               <p className="font-medium text-gray-800 truncate">{file.name}</p>
                               <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                             </div>
                           </div>
                           <div className="flex items-center gap-2 ml-2">
                             <CheckCircle className="w-4 h-4 text-green-600" />
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => removeResumeFile(index)}
                               className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                             >
                               <X className="w-3 h-3" />
                             </Button>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </CardContent>
               </Card>
              <Card className="bg-[rgba(194,194,235,0.05)] shadow-sm">
                <CardHeader className="bg-[rgba(194,194,235,0.92)]">
                  <CardTitle className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-purple-600" />
                    Scoring Weights
                  </CardTitle>
                  <CardDescription className="text-gray-700">
                    Adjust the importance of each metric.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-6 bg-[rgba(194,194,235,0.1)]">
                   <WeightSliders 
                      weights={weights}
                      onWeightsChange={setWeights}
                      disabled={isLoading}
                    />
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-center">
              <Button 
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                size="lg"
                className="h-14 px-12 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-3" />
                    Analyze Resumes
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </main>

      {analysisResult && isComparisonModalOpen && (
        <ComparisonModal 
            isOpen={isComparisonModalOpen}
            onClose={() => setIsComparisonModalOpen(false)}
            results={comparisonResults}
            details={analysisResult.details}
        />
      )}
      
      {analysisResult && isViewerOpen && currentRankedResult && (
         <ResumeViewerModal
            isOpen={isViewerOpen}
            onClose={() => setIsViewerOpen(false)}
            result={currentRankedResult}
            details={analysisResult.details[currentRankedResult.filename]}
            file={currentFile}
            resumeContent={currentResume?.content}
            resumeUrl={currentResume?.url}
            onNext={() => setViewingIndex(i => (i + 1) % analysisResult.rankedResumes.length)}
            onPrev={() => setViewingIndex(i => (i - 1 + analysisResult.rankedResumes.length) % analysisResult.rankedResumes.length)}
            hasNext={viewingIndex < analysisResult.rankedResumes.length - 1}
            hasPrev={viewingIndex > 0}
        />
      )}
    </div>
  );
}
