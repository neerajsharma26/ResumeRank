'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Chrome } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { user, signInWithGoogle, loading } = useAuth();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);


  const handleSignIn = async () => {
    await signInWithGoogle();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <Card className="mx-auto w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Rocket className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold">ResumeRank</CardTitle>
          <CardDescription>
            Sign in to access your AI-powered resume analysis dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <Button onClick={handleSignIn} className="w-full" size="lg" disabled={loading}>
              <>
                <Chrome className="mr-2 h-5 w-5" />
                {loading ? 'Signing In...' : 'Sign In with Google'}
              </>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
