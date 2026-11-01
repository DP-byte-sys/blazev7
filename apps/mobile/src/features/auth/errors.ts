interface ErrorLike {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/** Maps backend auth errors to messages that are safe to show (no raw server text, no account enumeration). */
export function toSafeAuthMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const text = `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
  if (e.code === 'invalid_credentials' || text.includes('invalid login credentials'))
    return 'Incorrect email or password.';
  if (e.code === 'email_not_confirmed')
    return 'Please confirm your email address before signing in.';
  if (e.status === 429 || e.code === 'over_request_rate_limit')
    return 'Too many attempts. Please wait a minute and try again.';
  if (
    e.name === 'AuthRetryableFetchError' ||
    text.includes('network') ||
    text.includes('fetch') ||
    e.status === 0
  ) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return 'Sign-in failed. Please try again.';
}
