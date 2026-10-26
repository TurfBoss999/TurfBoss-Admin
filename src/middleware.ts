import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAccessFor, isSupabaseAuthCookie, type DenyReason } from '@/lib/adminAccess';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Refresh session and check authentication
  const { data: { user } } = await supabase.auth.getUser();

  // If user is not authenticated and trying to access protected routes, redirect to login
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard') || 
                           request.nextUrl.pathname.startsWith('/admin');
  
  if (!user && isProtectedRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Only admins get in. Read the role fresh on every page load; anything but a clear 'admin' is turned away.
  if (user && isProtectedRoute) {
    let denyReason: DenyReason | null = null;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        denyReason = 'error';
      } else {
        const access = adminAccessFor(profile);
        if (access !== 'admin') denyReason = access;
      }
    } catch {
      denyReason = 'error';
    }

    if (denyReason) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('reason', denyReason);
      const denied = NextResponse.redirect(loginUrl);
      // Sign out of this app only: clear the auth cookies here. (Not a global sign-out, so a crew login stays valid in the Crew app.)
      for (const cookie of request.cookies.getAll()) {
        if (isSupabaseAuthCookie(cookie.name)) {
          denied.cookies.set({ name: cookie.name, value: '', maxAge: 0, path: '/' });
        }
      }
      return denied;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Only run middleware on dashboard and admin routes.
     * Skip static files, images, API routes, login page, etc.
     */
    '/dashboard/:path*',
    '/admin/:path*',
  ],
};
