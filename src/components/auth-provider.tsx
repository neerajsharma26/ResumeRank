'use client';

import React, {createContext, useContext} from 'react';
import {useAuth as useFirebaseAuth, AuthContextType} from '@/hooks/use-auth';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const auth = useFirebaseAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  // The context can be null during the initial loading state on the client.
  // We'll handle the loading state in the components that use the hook.
  return context;
};
