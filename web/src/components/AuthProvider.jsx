'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let subscription;

    async function init() {
      try {
        const supabase = getSupabase();
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (mounted) setUser(data.session?.user ?? null);

        const authState = supabase.auth.onAuthStateChange((_event, session) => {
          if (mounted) setUser(session?.user ?? null);
        });

        subscription = authState.data.subscription;
      } catch (initError) {
        if (mounted) setError(initError.message || 'Unable to initialize authentication.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, error }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
