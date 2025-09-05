import { Rocket } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-card border-b sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Rocket className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">ResumeRank</h1>
          </div>
          <p className="text-sm text-muted-foreground hidden md:block">
            AI-Powered Resume Analysis and Ranking
          </p>
        </div>
      </div>
    </header>
  );
}
