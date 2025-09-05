'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAnalysisReports } from '@/app/actions';
import type { AnalysisResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, PlusCircle, Inbox, AlertTriangle, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Header from './layout/header';

type Report = AnalysisResult & { id: string, jobDescription: string, createdAt: string };

const ReportCard = ({ report }: { report: Report }) => (
  <Card className="hover:shadow-lg transition-shadow">
    <CardHeader>
      <CardTitle className="text-lg flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" />
        <span className="truncate">{report.jobDescription}</span>
      </CardTitle>
      <CardDescription>
        Analyzed {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })} • {report.rankedResumes.length} resumes
      </CardDescription>
    </CardHeader>
    <CardContent>
        <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>Top Candidate:</span>
            <span className="font-semibold text-foreground truncate">{report.rankedResumes[0]?.filename.replace(/_/g, ' ').replace('.txt', '')}</span>
        </div>
        <div className="flex justify-between items-center text-sm text-muted-foreground mt-1">
            <span>Top Score:</span>
            <span className="font-bold text-primary">{report.rankedResumes[0]?.score}</span>
        </div>
    </CardContent>
  </Card>
);

export default function Dashboard({ onNewAnalysis }: { onNewAnalysis: () => void }) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      setIsLoading(true);
      getAnalysisReports(user.uid)
        .then(data => setReports(data))
        .catch(err => setError(err.message || 'Failed to load reports.'))
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <Button onClick={onNewAnalysis} size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              New Analysis
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!isLoading && error && (
            <Card className="bg-destructive/10 border-destructive/50">
              <CardContent className="p-6 flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <div>
                    <CardTitle className="text-destructive">Error</CardTitle>
                    <p className="text-destructive/80">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && reports.length === 0 && (
            <Card className="flex flex-col items-center justify-center min-h-[40vh] border-dashed">
                <Inbox className="w-16 h-16 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mt-4">No Reports Yet</h2>
                <p className="text-muted-foreground mt-2">Click "New Analysis" to get started.</p>
            </Card>
          )}
          
          {!isLoading && !error && reports.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map(report => (
                    <ReportCard key={report.id} report={report} />
                ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
