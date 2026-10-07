'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { TurfBossLogo } from '@/components/TurfBossLogo';
import {
  recallResetEmail,
  classifyReason,
  describeCodeError,
  LINK_PROBLEM_MESSAGES,
  type LinkProblem,
} from '@/lib/passwordReset';

// checking: looking for a recovery session from the emailed link
// code: the link could not finish here, so ask for the emailed code instead
// password: we have a recovery session, ask for the new password
type Stage = 'checking' | 'code' | 'password' | 'success';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>('checking');
  const [problem, setProblem] = useState<LinkProblem>('none');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const router = useRouter();
  const checked = useRef(false);

  // Look for a recovery session. The callback has already traded the emailed link for one
  // when the link worked; when it did not, it sends us here with the reason in the address.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    async function checkSession() {
      setEmail(recallResetEmail());
      const url = new URL(window.location.href);
      const linkFailed = url.searchParams.get('link') === 'failed';
      const reason = url.searchParams.get('reason');
      // Keep the reason out of the address bar once it has been read
      if (linkFailed) window.history.replaceState(null, '', url.pathname);

      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStage('password');
        return;
      }

      if (linkFailed) {
        console.error('[reset-password] link could not finish:', reason);
        setProblem(classifyReason(reason));
      }
      setStage('code');
    }

    checkSession().catch((err) => {
      console.error('[reset-password] unexpected error while checking the link:', err);
      setProblem('invalid');
      setStage('code');
    });
  }, []);

  // A new email replaces the old one (the old link and code stop working), which is the
  // fix when the link was opened and used up the code.
  const handleResend = async () => {
    setCodeError('');
    setResendNote('');
    if (!email.trim()) {
      setCodeError('Enter your email address above first, then send the new email.');
      return;
    }
    setIsResending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (sendError) {
        console.error('[reset-password] resend failed:', sendError.name, sendError.code, sendError.message);
        setCodeError(
          sendError.status === 429 || sendError.code === 'over_email_send_rate_limit'
            ? 'You asked for an email a moment ago. Wait a minute, then try again.'
            : 'We could not send the email. Check the address and try again.'
        );
        return;
      }
      setOtp('');
      setResendNote(
        'New email sent. Open it, read the code, and type it above. Do not open the link in the email. If you do not see it, check your spam folder.'
      );
    } catch (err) {
      console.error('[reset-password] resend failed:', err);
      setCodeError('Something went wrong. Check your connection and try again.');
    } finally {
      setIsResending(false);
    }
  };

  // Finish with the code from the email. This does not depend on which browser asked
  // for the reset.
  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError('');
    setIsVerifying(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.replace(/\s/g, ''),
        type: 'recovery',
      });

      if (verifyError) {
        console.error('[reset-password] code check failed:', verifyError.name, verifyError.code, verifyError.message);
        setCodeError(describeCodeError(verifyError));
        return;
      }

      setStage('password');
    } catch (err) {
      console.error('[reset-password] code check failed:', err);
      setCodeError('Something went wrong. Check your connection and try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setStage('success');

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="flex items-center space-x-2">
          <svg className="h-6 w-6 animate-spin text-green-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-400">Verifying reset link...</span>
        </div>
      </div>
    );
  }

  if (stage === 'code') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="w-full max-w-md px-4">
          <div className="rounded-2xl bg-white p-8 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">Enter your code</h2>
              <p className="mt-2 text-sm text-gray-500">{LINK_PROBLEM_MESSAGES[problem]}</p>
            </div>

            <form onSubmit={handleVerifyCode} className="mt-6 space-y-5">
              <div>
                <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                  placeholder="admin@turfboss.com"
                />
              </div>

              <div>
                <label htmlFor="resetCode" className="block text-sm font-medium text-gray-700">
                  Code from the email
                </label>
                <input
                  id="resetCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  minLength={6}
                  maxLength={12}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 tracking-widest text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                  placeholder="Enter the code"
                />
              </div>

              {codeError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {codeError}
                </div>
              )}

              {resendNote && (
                <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  {resendNote}
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying}
                className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifying ? 'Checking...' : 'Continue'}
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center space-y-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="inline-flex w-full items-center justify-center rounded-lg border border-green-600 px-4 py-3 font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResending ? 'Sending...' : 'Send me a new email'}
              </button>
              <Link
                href="/login"
                className="inline-flex items-center space-x-2 text-sm font-medium text-green-600 hover:text-green-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Back to sign in</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center">
            <TurfBossLogo className="h-12" />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {stage === 'success' ? (
            /* Success State */
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">Password reset!</h2>
              <p className="mt-2 text-sm text-gray-500">
                Your password has been successfully updated. You&apos;ll be redirected to the login page shortly.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center space-x-2 text-sm font-medium text-green-600 hover:text-green-700"
              >
                <span>Go to sign in now</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          ) : (
            /* Form State */
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Set new password</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Must be at least 6 characters long.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                    placeholder="Enter new password"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Updating...
                    </>
                  ) : (
                    'Reset password'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-400">
          &copy; 2026 TurfBoss. All rights reserved.
        </p>
      </div>
    </div>
  );
}
