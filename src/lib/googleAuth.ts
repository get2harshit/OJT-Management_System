// ─────────────────────────────────────────────────────────────────────────────
// Google sign-in, done as a plain browser redirect against Supabase's own
// authorize endpoint rather than through @supabase/supabase-js.
//
// The SDK would bring its own session store (localStorage, refreshed on a
// timer) alongside the httpOnly cookies the backend already issues, leaving
// two places that each believe they own the session and no rule for which
// wins when they disagree. Everything here is a URL and a hash fragment: the
// session Supabase returns is handed straight to the backend, which verifies
// it and sets the same cookies the password flow sets, and is then discarded.
// ─────────────────────────────────────────────────────────────────────────────

// The Supabase project every environment authenticates against, defaulted the
// same way the backend's own URL is in lib/api/client.ts — env var for a local
// override, real value in code.
//
// This used to be env-only, with the button hidden whenever the variable was
// missing. That hid it everywhere except a machine that happened to have a
// .env.local: the deploy builds in Docker, and .dockerignore excludes .env*, so
// no env file can reach the build at all. The result was a feature that looked
// unbuilt rather than unconfigured, on every environment including staging.
//
// Not a secret. It is the address the browser is sent to, it ships in every
// bundle, and the backend's URL sits in code beside it for the same reason.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cumeeqozfrnehtjivirf.supabase.co';

/**
 * Hands the browser to Google. Control does not return — the page navigates
 * away and comes back to `redirect_to` with the session in the URL hash.
 *
 * Supabase only honours a redirect target that is on its allow-list, so the
 * origin this is served from has to be registered in the dashboard.
 */
export function startGoogleSignIn(): void {
  const redirectTo = `${window.location.origin}/`;
  window.location.assign(
    `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`
  );
}

export interface GoogleRedirectResult {
  /** Present when the provider returned a session. */
  session?: { accessToken: string; refreshToken: string };
  /** Present when the provider refused — already human-readable. */
  error?: string;
}

/**
 * Reads the result of a Google redirect out of the URL, exactly once.
 *
 * Returns null when this is an ordinary page load, so the caller can treat
 * "came back from Google" and "just opened the login page" the same way.
 *
 * The hash is cleared whether it carried a session or an error. Access tokens
 * in a URL are worth removing on principle — they end up in history and in
 * anything the user pastes — and leaving the fragment in place would also
 * make a refresh replay a redirect that has already been consumed.
 */
export function consumeGoogleRedirect(): GoogleRedirectResult | null {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const error = params.get('error_description') ?? params.get('error');

  // Some other fragment — a deep link, an anchor. Leave it alone.
  if (!accessToken && !error) return null;

  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (error) return { error };
  // A session without a refresh token can't be renewed, and would strand the
  // user at the first expiry with no way back except signing in again.
  if (!accessToken || !refreshToken) {
    return { error: 'Google sign-in returned an incomplete session. Please try again.' };
  }
  return { session: { accessToken, refreshToken } };
}
