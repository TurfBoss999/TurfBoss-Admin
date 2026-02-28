'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Profile, UserRole } from '@/types/database';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  profile: Profile | null;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const supabase = getSupabaseBrowserClient();

// Profile cache to avoid re-fetching on every auth event
const profileCache = new Map<string, Profile>();

async function fetchProfile(userId: string): Promise<Profile | null> {
  // Return cached profile if available
  const cached = profileCache.get(userId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  if (!data) {
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, role: 'admin' })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating profile:', insertError);
      return null;
    }

    profileCache.set(userId, newProfile as Profile);
    return newProfile as Profile;
  }

  profileCache.set(userId, data as Profile);
  return data as Profile;
}

function buildAuthUser(supabaseUser: SupabaseUser, profile: Profile | null): AuthUser {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    role: profile?.role || 'crew',
    name: supabaseUser.email?.split('@')[0] || 'User',
    profile,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 1. Check session immediately on mount
    const initSession = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user) {
        const profile = await fetchProfile(currentSession.user.id);
        setUser(buildAuthUser(currentSession.user, profile));
        setSession(currentSession);
      }
      setIsLoading(false);
    };
    initSession();

    // 2. Listen for future auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {
        // Skip INITIAL_SESSION since getSession() above handles it
        if (event === 'INITIAL_SESSION') return;

        if (event === 'TOKEN_REFRESHED' && newSession) {
          setSession(newSession);
          // Re-fetch user profile on token refresh to ensure state is consistent
          if (newSession.user) {
            const profile = await fetchProfile(newSession.user.id);
            setUser(buildAuthUser(newSession.user, profile));
          }
          return;
        }

        if (event === 'SIGNED_IN' && newSession?.user) {
          // Update both session and user
          setSession(newSession);
          const profile = await fetchProfile(newSession.user.id);
          setUser(buildAuthUser(newSession.user, profile));
          return;
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          profileCache.clear();
        }

        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setIsLoading(false);
      return { success: false, error: error.message };
    }

    if (data.user) {
      const profile = await fetchProfile(data.user.id);
      setUser(buildAuthUser(data.user, profile));
      setSession(data.session);
    }

    setIsLoading(false);
    return { success: true };
  }, []);

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
