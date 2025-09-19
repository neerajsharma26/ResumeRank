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
    // First, check for the redirect result when the component mounts
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          // User is signed in via redirect.
          setUser(result.user);
        }
      })
      .catch((error) => {
        console.error('Error getting redirect result:', error);
      })
      .finally(() => {
         // After checking redirect, set up the state change listener.
         // This will also handle the case where the user is already signed in.
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          setUser(user);
          setLoading(false);
        });
        
        // Return the unsubscribe function to be called on cleanup.
        return () => unsubscribe();
      });
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      // We don't need to await this. It will navigate the page away.
      signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Error initiating sign in with redirect:', error);
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return {user, loading, signInWithGoogle, logout};
}
