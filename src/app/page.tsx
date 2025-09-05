'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth} from '@/hooks/use-auth';
import MainPage from '@/components/main-page';
import { Loader2 } from 'lucide-react';
import Dashboard from '@/components/dashboard';
import type { AnalysisResult } from '@/lib/types';

export type Report = AnalysisResult & { id: string, jobDescription: string, createdAt: string };

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

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if(selectedReport) {
    return <MainPage onBack={handleBackToDashboard} existingResult={selectedReport} />;
  }

  if (showUploader) {
      return <MainPage onBack={handleBackToDashboard} />;
  }

  return <Dashboard onNewAnalysis={() => setShowUploader(true)} onViewReport={setSelectedReport} />;
}
