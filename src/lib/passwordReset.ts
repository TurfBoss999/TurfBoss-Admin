// ================================
// PASSWORD RESET HELPERS
// Shared by the forgot-password page (requests the reset) and the reset page (finishes it)
// ================================

// The reset email address is remembered for this tab only, so the code-entry step can
// prefill it. Storage can be blocked or empty (private mode, another browser), so every
// access is wrapped and the page works without it.
const RESET_EMAIL_KEY = 'admin-reset-email';

export function rememberResetEmail(email: string) {
  try {
    window.sessionStorage.setItem(RESET_EMAIL_KEY, email);
  } catch {
    // ignore: the reset page just asks for the address again
  }
}

export function recallResetEmail(): string {
  try {
    return window.sessionStorage.getItem(RESET_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

// Why the emailed link could not finish on this device.
export type LinkProblem = 'none' | 'other-browser' | 'expired' | 'invalid';

// The reset link needs a secret that was saved in the browser that asked for the reset.
// A link opened in another browser, an email app's own browser or a private tab cannot
// finish. The callback passes the reason in the address; this maps it to a message.
export function classifyReason(reason: string | null | undefined): LinkProblem {
  if (!reason) return 'invalid';
  if (reason === 'pkce_code_verifier_not_found') return 'other-browser';
  if (reason === 'otp_expired' || reason === 'flow_state_expired' || reason === 'flow_state_not_found') {
    return 'expired';
  }
  return 'invalid';
}

// The emailed link and the emailed code are the same one-time key: using either one
// cancels the other, and asking for a new email cancels the old one.
export const LINK_PROBLEM_MESSAGES: Record<LinkProblem, string> = {
  none: 'Open your reset email and type the code from it here. If you open the link in the email instead, it uses up the code.',
  'other-browser':
    'This reset link could not finish in this browser, and opening it used up the code in that email. Send yourself a new email below, then type the new code here. Do not open the link in the new email.',
  expired:
    'This reset link has expired or was already used, and the code in that email stopped working with it. Send yourself a new email below, then type the new code here. Do not open the link in the new email.',
  invalid:
    'We could not use this reset link, and the code in that email may no longer work. Send yourself a new email below, then type the new code here. Do not open the link in the new email.',
};

type AuthErrorLike = { name?: string; code?: string; message?: string; status?: number };

export const CODE_ERROR_HINT =
  'That code is incorrect or has expired. If you opened the link in that email, or asked for another email since, the code no longer works. Send yourself a new email, then type the newest code without opening the link.';

export function describeCodeError(error: AuthErrorLike): string {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return CODE_ERROR_HINT;
}
