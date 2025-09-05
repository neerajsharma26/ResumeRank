'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth} from '@/hooks/use-auth';
import MainPage from '@/components/main-page';
import { Loader2 } from 'lucide-react';
import Dashboard from '@/components/dashboard';

export default function Home() {
  const {user, loading} = useAuth();
  const router = useRouter();
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (showUploader) {
      return <MainPage onBack={() => setShowUploader(false)} />;
  }

  return <Dashboard onNewAnalysis={() => setShowUploader(true)} />;
}
