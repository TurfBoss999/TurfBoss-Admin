'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { adminAccessFor, DENY_MESSAGES, type DenyReason } from '@/lib/adminAccess';
import { Profile, UserRole } from '@/types/database';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  profile: Profile;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  // Set when a signed-in account was turned away (crew login, or no profile row). The person has been signed out.
  deniedReason: DenyReason | null;
  // True when the account could not be loaded in time: show "Couldn't load your account" with a Reload button.
  loadError: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const supabase = getSupabaseBrowserClient();

// How long to wait on the account lookup before showing the reload message instead of a spinner
const ACCOUNT_TIMEOUT_MS = 10_000;

// Profile cache to avoid re-fetching on every auth event
const profileCache = new Map<string, Profile>();

type ProfileResult = { status: 'ok'; profile: Profile } | { status: 'none' } | { status: 'error' };

// Resolves to `onTimeout` if `promise` has not settled in time (the promise itself may still be pending).
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(onTimeout); }
    );
  });
}

// Read the person's profile. Never throws and never waits longer than ACCOUNT_TIMEOUT_MS.
// A missing profile is reported as 'none'; nothing is created here.
async function fetchProfile(userId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ProfileResult> {
  if (!fresh) {
    const cached = profileCache.get(userId);
    if (cached) return { status: 'ok', profile: cached };
  }

  const controller = new AbortController();
  const lookup = (async (): Promise<ProfileResult> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return { status: 'error' };
      }
      if (!data) return { status: 'none' };

      profileCache.set(userId, data as Profile);
      return { status: 'ok', profile: data as Profile };
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
      return { status: 'error' };
    }
  })();

  const result = await withTimeout<ProfileResult>(lookup, ACCOUNT_TIMEOUT_MS, { status: 'error' });
  if (result.status === 'error') controller.abort();
  return result;
}

function buildAuthUser(supabaseUser: SupabaseUser, profile: Profile): AuthUser {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    role: profile.role,
    name: supabaseUser.email?.split('@')[0] || 'User',
    profile,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deniedReason, setDeniedReason] = useState<DenyReason | null>(null);
  const [loadError, setLoadError] = useState(false);
  const initializedRef = useRef(false);
  const loggingInRef = useRef(false);

  // Sign out of this app only (the person's session in the Crew app is left alone)
  const turnAway = useCallback(async (reason: DenyReason) => {
    profileCache.clear();
    setUser(null);
    setSession(null);
    setDeniedReason(reason);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }, []);

  // Look up the role for a signed-in session and let in admins only. Never throws.
  // `background` rechecks (token refresh, tab coming back) keep the screen as it is if the lookup fails.
  const loadAccount = useCallback(async (activeSession: Session, { background = false, fresh = false } = {}) => {
    const result = await fetchProfile(activeSession.user.id, { fresh });

    if (result.status === 'error') {
      if (!background) setLoadError(true);
      setIsLoading(false);
      return;
    }

    const access = result.status === 'ok' ? adminAccessFor(result.profile) : 'no_profile';
    if (access !== 'admin' || result.status !== 'ok') {
      await turnAway(access === 'crew' ? 'crew' : 'no_profile');
      setIsLoading(false);
      return;
    }

    setUser(buildAuthUser(activeSession.user, result.profile));
    setSession(activeSession);
    setLoadError(false);
    setDeniedReason(null);
    setIsLoading(false);
  }, [turnAway]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 1. Check session immediately on mount. Whatever happens, isLoading ends.
    const initSession = async () => {
      try {
        const currentSession = await withTimeout<Session | null | 'timeout'>(
          supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => data.session),
          ACCOUNT_TIMEOUT_MS,
          'timeout'
        );
        if (currentSession === 'timeout') {
          setLoadError(true);
        } else if (currentSession?.user) {
          await loadAccount(currentSession);
        }
      } catch (err) {
        console.error('Error loading session:', err);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };
    initSession();

    // 2. Listen for future auth changes (sign in, sign out, token refresh).
    // This callback must not await Supabase calls (they wait on the auth lock this callback runs inside,
    // which can deadlock), so it only updates state and defers the profile lookup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession: Session | null) => {
        // Skip INITIAL_SESSION since getSession() above handles it
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          profileCache.clear();
          setIsLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED' && newSession) {
          setSession(newSession);
          // Re-check the role (served from the cache unless it is gone) to keep state consistent
          setTimeout(() => { void loadAccount(newSession, { background: true }); }, 0);
          return;
        }

        if (event === 'SIGNED_IN' && newSession?.user) {
          // login() does its own check; this covers other sign-ins (password reset link, another tab)
          if (loggingInRef.current) return;
          setSession(newSession);
          setTimeout(() => { void loadAccount(newSession); }, 0);
          return;
        }

        setIsLoading(false);
      }
    );

    // A tab coming back after a long time away: re-read the role so a changed role does not go unnoticed.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setTimeout(() => {
        void supabase.auth.getSession().then(({ data: { session: current } }: { data: { session: Session | null } }) => {
          if (current?.user) return loadAccount(current, { background: true, fresh: true });
        }).catch((err: unknown) => console.error('Error rechecking account:', err));
      }, 0);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAccount]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setLoadError(false);
    setDeniedReason(null);
    loggingInRef.current = true;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (data.user && data.session) {
        const result = await fetchProfile(data.user.id, { fresh: true });

        if (result.status === 'error') {
          await turnAway('error');
          setIsLoading(false);
          return { success: false, error: "Couldn't load your account. Please try again." };
        }

        const access = result.status === 'ok' ? adminAccessFor(result.profile) : 'no_profile';
        if (access !== 'admin' || result.status !== 'ok') {
          const reason = access === 'crew' ? 'crew' : 'no_profile';
          await turnAway(reason);
          setIsLoading(false);
          return { success: false, error: DENY_MESSAGES[reason] };
        }

        setUser(buildAuthUser(data.user, result.profile));
        setSession(data.session);
      }

      setIsLoading(false);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      setIsLoading(false);
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    } finally {
      loggingInRef.current = false;
    }
  }, [turnAway]);

  const logout = useCallback(async () => {
    profileCache.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!user,
        isLoading,
        isAdmin: user?.role === 'admin',
        deniedReason,
        loadError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
