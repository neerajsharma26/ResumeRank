'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BarChart3, LayoutDashboard, Loader2, Upload, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';

export default function LoginPage() {
  const router = useRouter();
  const { user, signInWithGoogle, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);


  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      // The redirect will happen, so we might not even hit the end of this.
    } catch (error) {
      console.error("Sign-in failed", error);
    }
  };
  
  if (loading) {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Authenticating...</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-slate-100/30 pointer-events-none"></div>
      
      <header className="flex items-center justify-between bg-card shadow-sm border-b relative z-10 px-8 py-4">
        <div className="flex items-center gap-4">
          <Logo />
          <h1 className="text-3xl font-semibold text-black font-['Bitter']">Hire Varahe</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 py-16 relative z-10">
        <div className="w-full max-w-6xl flex flex-col items-center space-y-20">
          <div className="w-full max-w-md relative">
            <div className="bg-gradient-to-br from-teal-400 via-cyan-500 to-purple-600 rounded-3xl p-12 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
                <div className="absolute top-1/2 -right-16 w-48 h-48 bg-white/5 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-64 h-32 bg-white/10 rounded-full blur-xl"></div>
              </div>
              
              <div className="relative z-10 text-center">
                <h2 className="text-4xl font-bold mb-6 text-white">Welcome</h2>
                <p className="text-white/90 mb-10 text-lg">Sign in to continue using hire varahe</p>
                <Button 
                  onClick={handleSignIn}
                  disabled={loading}
                  className="w-full bg-white hover:bg-gray-50 text-gray-800 border-0 flex items-center justify-center gap-3 py-6 rounded-full shadow-lg transition-all duration-200 hover:scale-105"
                  size="lg"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-4xl">
            <h3 className="text-xl font-semibold text-center mb-8 text-gray-800">How it works</h3>
            <div className="flex items-center justify-center space-x-12">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-blue-100 rounded-xl flex items-center justify-center border-2 border-blue-200 transition-colors hover:bg-blue-200">
                  <Upload className="w-10 h-10 text-blue-600" />
                </div>
                <p className="font-medium text-gray-700">Upload Files</p>
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">1</div>
              </div>
              
              <ArrowRight className="w-8 h-8 text-gray-400" />
              
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-green-100 rounded-xl flex items-center justify-center border-2 border-green-200 transition-colors hover:bg-green-200">
                  <BarChart3 className="w-10 h-10 text-green-600" />
                </div>
                <p className="font-medium text-gray-700">Analyze</p>
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold">2</div>
              </div>
              
              <ArrowRight className="w-8 h-8 text-gray-400" />
              
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-purple-100 rounded-xl flex items-center justify-center border-2 border-purple-200 transition-colors hover:bg-purple-200">
                  <LayoutDashboard className="w-10 h-10 text-purple-600" />
                </div>
                <p className="font-medium text-gray-700">View Dashboard</p>
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">3</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
