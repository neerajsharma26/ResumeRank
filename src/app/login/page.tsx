'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {useAuth} from '@/hooks/use-auth';
import {Rocket, Chrome} from 'lucide-react';

export default function LoginPage() {
  const {user, signInWithGoogle, loading} = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

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
            <Button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                'Loading...'
              ) : (
                <>
                  <Chrome className="mr-2 h-5 w-5" />
                  Sign In with Google
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
