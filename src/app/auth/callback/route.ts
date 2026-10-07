import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  // Why the link could not be used, so the reset page can say what to do instead of
  // dropping the person on a login screen that gives no hint.
  let failureReason = 'no_code';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    failureReason = error.code ?? error.name ?? 'exchange_failed';
    console.error('[auth/callback] code exchange failed:', error.name, error.code, error.message);
  }

  // A reset link that cannot finish goes to the reset page, which offers the emailed code
  if (next === '/reset-password') {
    return NextResponse.redirect(
      `${origin}/reset-password?link=failed&reason=${encodeURIComponent(failureReason)}`
    );
  }

  // If code exchange fails or no code, redirect to an error page
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
