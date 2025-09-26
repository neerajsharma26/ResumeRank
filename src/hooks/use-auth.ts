'use client';

import {useState, useEffect, useCallback} from 'react';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from 'firebase/auth';
import {auth} from '@/lib/firebase';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const isBrowser = typeof window !== 'undefined';

export function useAuth(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = useCallback(async () => {
    if (!isBrowser) return;
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Error initiating sign in with redirect:', error);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isBrowser) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        try {
          const result = await getRedirectResult(auth);
          if (result?.user) {
            setUser(result.user);
          }
        } catch (error) {
          console.error('Error getting redirect result:', error);
        } finally {
            if (!auth.currentUser) {
              setUser(null);
            }
            setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return {user, loading, signInWithGoogle, logout};
}
