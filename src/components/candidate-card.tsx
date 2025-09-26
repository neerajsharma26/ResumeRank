
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { AnalysisDetails, CandidateStatus } from '@/lib/types';
import type { RankResumesOutput } from '@/app/actions';
import { Award, Briefcase, ChevronDown, Star, Tag, MoreVertical, CheckCircle, XCircle, Undo } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';
import type { MetricWeights } from '@/lib/types';



interface CandidateCardProps {
  rank: number;
  rankedResume: RankResumesOutput[0];
  details?: AnalysisDetails[string];
  status: CandidateStatus;
  weights:MetricWeights;
  onStatusChange: (status: CandidateStatus) => void;
}

const getRankColor = (rank: number) => {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900';
  if (rank === 2) return 'bg-gray-300 text-gray-800';
  if (rank === 3) return 'bg-yellow-600/70 text-yellow-900';
  return 'bg-secondary text-secondary-foreground';
};

export default function CandidateCard({
  rank,
  rankedResume,
  details,
  status,
  weights,
  onStatusChange,
}: CandidateCardProps) {

  const scoreColor =
    rankedResume.score > 80
      ? 'bg-green-500'
      : rankedResume.score > 60
      ? 'bg-yellow-500'
      : 'bg-red-500';
  const statusConfig = {
    none: { text: 'Actions', className: '' },
    shortlisted: { text: 'Shortlisted', className: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200' },
    rejected: { text: 'Rejected', className: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200' },
  }

  const isLoadingDetails = !details;

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankColor(
                  rank
                )}`}
              >
                {rank}
              </span>
              <CardTitle className="text-xl">{rankedResume.filename.replace(/_/g, ' ').replace('.txt', '')}</CardTitle>
            </div>
            <CardDescription className="mt-2 text-sm">{rankedResume.highlights}</CardDescription>
          </div>
          <div className="flex flex-col items-end space-y-2">
             <Badge variant={rankedResume.score > 75 ? "default" : "secondary"} className={`text-lg ${rankedResume.score > 75 ? "bg-primary text-primary-foreground": "bg-secondary"}`}>
                {rankedResume.score}
                <span className="text-xs ml-1 mt-1">/100</span>
             </Badge>
             <p className="text-xs text-muted-foreground">Relevance Score</p> 
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="outline" size="sm" className={cn("w-full", statusConfig[status].className)}>
                  {statusConfig[status].text} <MoreVertical className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStatusChange('shortlisted')}>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                  <span>Shortlist</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange('rejected')}>
                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                  <span>Reject</span>
                </DropdownMenuItem>
                 {status !== 'none' && (
                  <>
                    <Separator className="my-1" />
                    <DropdownMenuItem onClick={() => onStatusChange('none')}>
                      <Undo className="mr-2 h-4 w-4" />
                      <span>Reset Status</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="pt-2">
            <Progress value={rankedResume.score} className={`h-2 [&>*]:${scoreColor}`} />
        </div>
      </CardHeader>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="details" className="border-b-0">
          <div className="px-6">
            <AccordionTrigger className="text-sm py-2 hover:no-underline justify-start gap-2">
              Show Details
            </AccordionTrigger>
          </div>
          <AccordionContent>
            <div className="px-6 pt-2 pb-6 space-y-4">
              <Separator />
              {isLoadingDetails ? (
                 <div className="space-y-4 pt-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                 </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary"/> Extracted Info</h4>
                    <p><strong>Years of Experience:</strong> {details.skills?.experienceYears ?? 'N/A'}</p>
                    <div>
                      <h5 className="font-medium mb-2 flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500"/> Skills</h5>
                      <div className="flex flex-wrap gap-2">
                        {details.skills?.skills?.length > 0 ? details.skills.skills.map((s, i) => <Badge key={`${s}-${i}`} variant="secondary">{s}</Badge>) : <span className="text-muted-foreground">None found</span>}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium mb-2 flex items-center gap-2"><Award className="w-4 h-4 text-blue-500"/> Certifications</h5>
                      <div className="flex flex-wrap gap-2">
                        {details.skills?.certifications?.length > 0 ? details.skills.certifications.map((c, i) => <Badge key={`${c}-${i}`} variant="secondary">{c}</Badge>) : <span className="text-muted-foreground">None found</span>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4 text-primary"/> Keyword Analysis</h4>
                    {/* <p><strong>Match Score:</strong> {details.keywords?.score ?? 'N/A'}/100</p> */}
                    <p><strong>Summary:</strong> {details.keywords?.summary ?? 'Not available.'}</p>
                    <div>
                      <h5 className="font-medium mb-2">Matched Keywords</h5>
                      <div className="flex flex-wrap gap-2">
                        {details.keywords?.matches?.length > 0 ? details.keywords.matches.map((m, i) => <Badge key={`${m}-${i}`} className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">{m}</Badge>) : <span className="text-muted-foreground">None</span>}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium mb-2">Missing Keywords</h5>
                      <div className="flex flex-wrap gap-2">
                        {details.keywords?.missing?.length > 0 ? details.keywords.missing.map((m, i) => <Badge key={`${m}-${i}`} variant="destructive" className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">{m}</Badge>) : <span className="text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
