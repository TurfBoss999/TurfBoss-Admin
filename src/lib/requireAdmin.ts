import { createSupabaseServerClient } from './supabaseServer';
import { Profile } from '@/types/database';

export class AdminAuthError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'AdminAuthError';
    this.statusCode = statusCode;
  }
}

export interface AdminUser {
  id: string;
  email: string;
  profile: Profile;
}

/**
 * Validates that the current user is authenticated and has admin role.
 * Throws AdminAuthError if validation fails.
 * 
 * @returns AdminUser object with user info and profile
 * @throws AdminAuthError if not authenticated or not an admin
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createSupabaseServerClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AdminAuthError('Unauthorized: Not authenticated', 401);
  }

  // Fetch user profile to check role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

  if (profileError) {
    console.error('Error fetching profile:', profileError);
    throw new AdminAuthError('Unauthorized: Error fetching profile', 403);
  }

  // If no profile exists, create one with admin role for first user
  if (!profile) {
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: user.id, role: 'admin' })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating profile:', insertError);
      throw new AdminAuthError('Unauthorized: Could not create profile', 403);
    }

    profile = newProfile;
  }

  if (profile.role !== 'admin') {
    throw new AdminAuthError('Forbidden: Admin access required', 403);
  }

  return {
    id: user.id,
    email: user.email || '',
    profile: profile as Profile,
  };
}

/**
 * Helper to handle API errors and return consistent response
 */
export function handleApiError(error: unknown): { message: string; status: number } {
  if (error instanceof AdminAuthError) {
    return { message: error.message, status: error.statusCode };
  }

  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }

  return { message: 'An unexpected error occurred', status: 500 };
}
