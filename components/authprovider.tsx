'use client';

// components/AuthProvider.tsx — global auth state for app.b2web.site
// ─────────────────────────────────────────────────────────────────────────────
// One subscription to supabase.auth.onAuthStateChange, mounted once at the
// root layout; everything else reads it through useAuth(). The listener is
// registered BEFORE the initial getSession() read so a SIGNED_IN event can
// never slip through the gap between read and subscribe. Sign-out is exposed
// here too: it never sets state by hand, the SIGNED_OUT event coming back
// through the listener is what flips every consumer at once (including other
// tabs, which GoTrue syncs via the storage event).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean; // true until the first session read resolves
  signOut: () => Promise<{ error: AuthError | null }>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe first. supabase-js v2 fires INITIAL_SESSION on subscribe,
    // then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED live.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    // Belt and braces: resolve the stored session even if INITIAL_SESSION
    // is slow. The listener value, if it already landed, wins.
    supabase.auth.getSession().then(({ data }) => {
      setSession((cur) => cur ?? data.session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // No manual setSession(null) here: SIGNED_OUT arrives via the listener.
    return { error };
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
