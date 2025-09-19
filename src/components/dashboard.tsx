'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAnalysisReports } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, PlusCircle, Inbox, AlertTriangle, FileText, CheckCircle, BarChart3, Users, Calendar, Eye, Plus, MoreVertical, Trash2, Grid3X3, List, Clock, FolderOpen, Search, LogOut, Settings, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Header from './layout/header';
import type { Report } from '@/app/page';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';


const StatCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) => (
    <Card>
      <CardContent className="p-6 text-center">
        <div className="mx-auto w-8 h-8 text-blue-600 mb-3">{icon}</div>
        <div className="text-2xl font-bold text-gray-800 mb-1">{value}</div>
        <div className="text-sm text-gray-600">{label}</div>
      </CardContent>
    </Card>
);

export default function Dashboard({ onNewAnalysis, onViewReport }: { onNewAnalysis: () => void, onViewReport: (report: Report) => void }) {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');


  useEffect(() => {
    if (user?.uid) {
      setIsLoading(true);
      getAnalysisReports(user.uid)
        .then(data => {
            const transformedData = data.map(r => ({
                ...r,
                status: 'ongoing' // Placeholder status
            }));
            setReports(transformedData as Report[]);
        })
        .catch(err => setError(err.message || 'Failed to load reports.'))
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  const filteredProjects = reports.filter(project => {
    const matchesSearch = project.jobDescription.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'completed') return matchesSearch && project.statuses && Object.values(project.statuses).every(s => s !== 'none');
    
    return matchesSearch;
  });

  const getMatchScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 80) return 'text-blue-600 bg-blue-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStatusColor = (report: Report) => {
    // This is a placeholder logic as we don't have project status
    const isCompleted = report.statuses && Object.values(report.statuses).length > 0;
    if (isCompleted) return 'text-green-600 bg-green-100';
    return 'text-blue-600 bg-blue-100';
  };
  
  const handleSignOut = async () => {
    await logout();
  }

  const renderCardView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {filteredProjects.map((project) => (
        <Card key={project.id} className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 text-lg leading-tight line-clamp-2">{project.jobDescription}</h3>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                 <Badge className={`${getStatusColor(project)} font-medium capitalize`}>
                  {project.statuses && Object.values(project.statuses).length > 0 ? 'Completed' : 'Ongoing'}
                </Badge>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem 
                        onClick={() => {
                            // Placeholder for delete
                            console.log("Delete project", project.id);
                        }}
                        className="cursor-pointer text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {project.resumes.length} resumes analyzed
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {project.rankedResumes.length} candidates
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
              </div>
              <div className="flex items-center gap-2">
                 <Clock className="w-4 h-4 text-blue-600" />
                 Last accessed {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
              </div>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Top Match Score</span>
                <Badge className={`${getMatchScoreColor(project.rankedResumes[0]?.score || 0)} font-semibold`}>
                  {project.rankedResumes[0]?.score || 'N/A'}%
                </Badge>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Top Candidate</p>
              <div className="flex flex-wrap gap-1">
                 <Badge variant="secondary" className="text-xs">
                    {project.rankedResumes[0]?.filename.replace(/_/g, ' ').replace('.txt', '') || 'N/A'}
                  </Badge>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 flex items-center gap-2"
                  onClick={() => onViewReport(project)}
                >
                  <Eye className="w-4 h-4" />
                  View Results
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                  disabled
                >
                  <BarChart3 className="w-4 h-4" />
                  Analytics
                </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderListView = () => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Resumes</TableHead>
            <TableHead>Avg Score</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProjects.map((project) => (
            <TableRow key={project.id} className="hover:bg-gray-50">
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 line-clamp-1">{project.jobDescription}</div>
                    <div className="text-sm text-gray-600">{project.resumes.length} candidates</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={`${getStatusColor(project)} font-medium capitalize`}>
                  {project.statuses && Object.values(project.statuses).length > 0 ? 'Completed' : 'Ongoing'}
                </Badge>
              </TableCell>
              <TableCell className="text-gray-600">{project.resumes.length}</TableCell>
              <TableCell>
                <Badge className={`${getMatchScoreColor(project.rankedResumes[0]?.score || 0)} font-semibold`}>
                    {project.rankedResumes[0]?.score || 'N/A'}%
                </Badge>
              </TableCell>
              <TableCell className="text-gray-600">{formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onViewReport(project)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        <BarChart3 className="w-4 h-4" />
                      </Button>
                    </>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                       <DropdownMenuItem 
                          onClick={() => {
                            // Placeholder for delete
                            console.log("Delete project", project.id);
                          }}
                          className="cursor-pointer text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  if (isLoading) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-slate-100/30 pointer-events-none"></div>
      
      <header className="flex items-center justify-between bg-[rgba(239,239,239,1)] shadow-sm border-b relative z-10 px-[32px] py-[16px]">
        <div className="flex items-center gap-4">
          <div className="bg-[rgba(242,242,242,1)] rounded-xl p-2">
            <div className="w-14 h-14 bg-[rgba(206,206,205,1)] rounded-lg flex items-center justify-center shadow-sm">
                <Image src="/images/varahe-logo.png" alt="Hire Varahe Logo" width={40} height={40} />
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-black font-['Bitter']">Hire Varahe</h1>
        </div>

        {user && <DropdownMenu>
          <DropdownMenuTrigger asChild>
             <Button variant="ghost" className="relative h-12 w-12 rounded-full bg-[rgba(232,227,227,0.68)]">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'User'} />
                <AvatarFallback className="bg-teal-100 text-teal-600">{user.displayName?.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-medium leading-none">{user.displayName}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </header>

      <main className="flex-1 px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl mx-auto space-y-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-black mb-2 font-['Bitter']">Analysis Projects Dashboard</h2>
            <p className="text-lg text-gray-600">
              Manage and review all resume analysis projects
            </p>
          </div>

          <Card className="bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="Search projects by title or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
                <Button className="h-12 px-6 bg-teal-600 hover:bg-teal-700 text-white">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                <Button 
                  onClick={onNewAnalysis}
                  className="h-12 px-6 bg-gradient-to-r from-teal-400 via-cyan-500 to-purple-600 hover:opacity-90 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Analysis
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between">
              <TabsList className="grid grid-cols-2 max-w-md">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  All ({reports.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Completed ({reports.filter(r => r.statuses && Object.values(r.statuses).length > 0).length})
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button
                  variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('card')}
                  className="h-8 px-3"
                >
                  <Grid3X3 className="w-4 h-4 mr-1" />
                  Cards
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 px-3"
                >
                  <List className="w-4 h-4 mr-1" />
                  List
                </Button>
              </div>
            </div>

            <TabsContent value={activeTab} className="space-y-6 mt-8">
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
                        <h3 className="font-semibold text-destructive">Error</h3>
                        <p className="text-destructive/80">{error}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {!isLoading && !error && filteredProjects.length === 0 && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">No projects found</h3>
                    <p className="text-gray-500">
                      {searchQuery ? 'Try adjusting your search terms.' : 'Create your first analysis project to get started.'}
                    </p>
                  </CardContent>
                </Card>
              )}
              {!isLoading && !error && filteredProjects.length > 0 && (
                viewMode === 'card' ? renderCardView() : renderListView()
              )}
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard icon={<FolderOpen />} label="Total Projects" value={reports.length} />
            <StatCard icon={<CheckCircle className="text-green-600"/>} label="Completed" value={reports.filter(r => r.statuses && Object.values(r.statuses).length > 0).length} />
            <StatCard icon={<Users className="text-purple-600"/>} label="Total Candidates" value={reports.reduce((total, r) => total + r.resumes.length, 0)} />
          </div>
        </div>
      </main>
    </div>
  );
}
