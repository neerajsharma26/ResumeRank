'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chrome, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { Logo } from '@/components/logo';

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

  // Show a loading indicator while the redirect is being processed
  if (loading) {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Authenticating...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <Card className="mx-auto w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <Logo />
          </div>
          <CardTitle className="text-3xl font-bold">Hire Varahe</CardTitle>
          <CardDescription>
            Sign in to access your AI-powered resume analysis dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <Button onClick={handleSignIn} className="w-full" size="lg">
              <>
                <Chrome className="mr-2 h-5 w-5" />
                Sign In with Google
              </>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
