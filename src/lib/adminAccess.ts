// Who may use the Admin app. The role lives in profiles.role; only 'admin' gets in.
// Shared by the middleware (server), the AuthContext (browser) and requireAdmin (API routes).

export type AdminAccess = 'admin' | 'crew' | 'no_profile';

// Why a person was turned away. 'error' = the role could not be read, so access is refused (fail closed).
export type DenyReason = 'crew' | 'no_profile' | 'error';

export const DENY_MESSAGES: Record<DenyReason, string> = {
  crew: 'This account is a crew login. Use the Crew app at crew.turfbosskc.com.',
  no_profile: "This account isn't set up for Admin. Ask the office to set it up.",
  error: "Couldn't check your account. Please sign in again.",
};

export function adminAccessFor(profile: { role?: string | null } | null | undefined): AdminAccess {
  if (!profile) return 'no_profile';
  return profile.role === 'admin' ? 'admin' : 'crew';
}

export function isDenyReason(value: string | null | undefined): value is DenyReason {
  return value === 'crew' || value === 'no_profile' || value === 'error';
}

// Name prefix of the Supabase auth cookies (including the .0 / .1 chunks of a long session).
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token');
}
