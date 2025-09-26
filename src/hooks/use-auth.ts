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

export function useAuth(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
      // Redirect will happen, so we don't need to set loading to false here.
      // The page will reload and the effect will handle the new auth state.
    } catch (error) {
      console.error('Error initiating sign in with redirect:', error);
      setLoading(false); // Only set loading to false if the redirect fails to initiate.
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      // The onAuthStateChanged listener will handle setting the user to null.
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  useEffect(() => {
    // This effect handles both the initial redirect result and subsequent auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        // If there's no user, check if we just came back from a redirect.
        try {
          const result = await getRedirectResult(auth);
          if (result?.user) {
            setUser(result.user);
          }
        } catch (error) {
          console.error('Error getting redirect result:', error);
        } finally {
            // Whether redirect check was successful or not, if there's no user, we are not loading.
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
