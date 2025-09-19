'use client';

import {useState, useEffect} from 'react';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from 'firebase/auth';
import {app} from '@/lib/firebase';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const auth = getAuth(app);

export function useAuth(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
         // Check for redirect result when the app initializes
        getRedirectResult(auth)
          .then((result) => {
            if (result?.user) {
              setUser(result.user);
            }
          })
          .catch((error) => {
            console.error('Error getting redirect result:', error);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
      // The user will be redirected, so the rest of the code in this block may not execute
      // until they return to the app. The onAuthStateChanged listener will handle the result.
    } catch (error) {
      console.error('Error initiating sign in with redirect:', error);
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null); // Explicitly set user to null on logout
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };

  return {user, loading, signInWithGoogle, logout};
}
