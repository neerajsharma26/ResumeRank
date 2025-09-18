'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth} from '@/hooks/use-auth';
import MainPage from '@/components/main-page';
import { Loader2 } from 'lucide-react';
import Dashboard from '@/components/dashboard';
import type { AnalysisResult, Resume } from '@/lib/types';

export type Report = Omit<AnalysisResult, 'resumes'> & { 
  id: string, 
  jobDescription: string, 
  createdAt: string, 
  resumes: (Omit<Resume, 'content'> & {url?: string})[]
};


export default function Home() {
  const {user, loading} = useAuth();
  const router = useRouter();
  const [showUploader, setShowUploader] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleBackToDashboard = () => {
      setShowUploader(false);
      setSelectedReport(null);
  }

  const handleAnalysisComplete = (report: Report) => {
    setSelectedReport(report);
    setShowUploader(false); // Hide uploader view, show report view
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if(selectedReport) {
    return <MainPage onBack={handleBackToDashboard} existingResult={selectedReport} onAnalysisComplete={handleAnalysisComplete} />;
  }

  if (showUploader) {
      return <MainPage onBack={handleBackToDashboard} onAnalysisComplete={handleAnalysisComplete} />;
  }

  return <Dashboard onNewAnalysis={() => setShowUploader(true)} onViewReport={setSelectedReport} />;
}
