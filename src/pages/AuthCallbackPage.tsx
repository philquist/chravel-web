import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Dedicated OAuth callback handler.
 *
 * Apple/Google redirect here with one of:
 *   - PKCE: `?code=...&state=...` (current default — see supabase client config)
 *   - Legacy implicit: `#access_token=...&refresh_token=...`
 *   - Provider error: `?error=...&error_description=...` (cancel / denied / misconfig)
 *
 * In the chravel-mobile WebView shell (App Store 2.1a rejection), the
 * provider redirect lands in an ASWebAuthenticationSession that is then
 * handed back to the main WebView. If we silently rely on `detectSessionInUrl`
 * and the session does not land within a couple seconds, the parent `AuthPage`
 * bounces the user back to `/auth` (the failure mode App Review observed).
 *
 * This page:
 *   1. Surfaces `?error=` from the provider immediately (no spin, no bounce)
 *   2. Short-circuits if a session already exists (native shell may pre-inject)
 *   3. Calls `exchangeCodeForSession(window.location.href)` for PKCE
 *   4. Polls `getSession()` up to ~3s as a safety net for hash flow
 *   5. Shows an actionable error + "Sign in with email" fallback on failure —
 *      never silently sends the user back to the login screen
 *   6. Emits one `[AuthCallback]` log line per outcome for resubmit forensics
 */

function getSafeReturnTo(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  return value;
}

type Status = 'exchanging' | 'success' | 'error';
type Flow = 'pkce' | 'hash' | 'provider-error' | 'pre-existing-session' | 'empty';

interface OutcomeLog {
  flow: Flow;
  status: 'success' | 'error';
  hasCode: boolean;
  hasHash: boolean;
  hasError: boolean;
  durationMs: number;
  error?: string;
}

function logOutcome(outcome: OutcomeLog): void {
  // Intentional production log: critical for App Review resubmit forensics on
  // physical-device runs. Low-volume (fires once per callback navigation).

  console.info('[AuthCallback]', outcome);
}

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('exchanging');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnTo = getSafeReturnTo(searchParams.get('returnTo'), '/');

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const fail = (
      flow: Flow,
      message: string,
      hints: { hasCode: boolean; hasHash: boolean; hasError: boolean },
    ) => {
      if (cancelled) return;
      setErrorMessage(message);
      setStatus('error');
      logOutcome({
        flow,
        status: 'error',
        hasCode: hints.hasCode,
        hasHash: hints.hasHash,
        hasError: hints.hasError,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    };

    const succeed = (
      flow: Flow,
      hints: { hasCode: boolean; hasHash: boolean; hasError: boolean },
    ) => {
      if (cancelled) return;
      setStatus('success');
      logOutcome({
        flow,
        status: 'success',
        hasCode: hints.hasCode,
        hasHash: hints.hasHash,
        hasError: hints.hasError,
        durationMs: Date.now() - startedAt,
      });
      navigate(returnTo, { replace: true });
    };

    const finish = async () => {
      const hasCode = searchParams.has('code');
      const providerError = searchParams.get('error');
      const providerErrorDescription = searchParams.get('error_description');
      const hasError = Boolean(providerError);
      const hasHash =
        typeof window !== 'undefined' && window.location.hash.includes('access_token');
      const hints = { hasCode, hasHash, hasError };

      try {
        // 1. Provider-side error wins. Show it verbatim, do not spin.
        if (hasError) {
          const msg =
            providerErrorDescription?.replace(/\+/g, ' ') ||
            providerError ||
            'Sign-in was cancelled or denied.';
          fail('provider-error', msg, hints);
          return;
        }

        // 2. Native shell may have already injected the session before we mounted.
        const existing = await supabase.auth.getSession();
        if (existing.data.session) {
          succeed('pre-existing-session', hints);
          return;
        }

        // 3. PKCE: exchange the authorization code for a session (awaited exactly once).
        //    The code_verifier is read from the same supabase-js auth storage (localStorage)
        //    that signInWithOAuth wrote at initiation — same singleton client, same storageKey.
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error && !hasHash) {
            // Explicit cause logging: opaque GoTrue failures like "Unable to exchange external
            // code" (and "c892"-type codes) otherwise reach App Review forensics as a bare
            // message. Capture code/status/name so the failure maps to a root cause.
            console.error('[AuthCallback] exchangeCodeForSession failed', {
              message: error.message,
              code: (error as { code?: string }).code,
              status: (error as { status?: number }).status,
              name: error.name,
            });
            fail('pkce', error.message || 'Sign-in failed.', hints);
            return;
          }
        } else if (!hasHash) {
          // 4. Nothing to exchange and no existing session — fail fast.
          fail('empty', 'No sign-in response detected. Please try again.', hints);
          return;
        }

        // 5. Safety net for hash flow + slow native bridge handoffs.
        for (let attempt = 0; attempt < 12; attempt++) {
          if (cancelled) return;
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            succeed(hasCode ? 'pkce' : 'hash', hints);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        fail(
          hasCode ? 'pkce' : 'hash',
          "We couldn't complete sign-in. Please try again, or use email and password.",
          hints,
        );
      } catch (err) {
        fail(
          'pkce',
          err instanceof Error ? err.message : 'Unexpected error completing sign-in.',
          hints,
        );
      }
    };

    void finish();

    return () => {
      cancelled = true;
    };
  }, [navigate, returnTo, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        {status === 'exchanging' && (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gold-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Completing sign-in…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-foreground">Sign-in didn't complete</h1>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => navigate('/auth?mode=signin', { replace: true })}
                className="w-full"
              >
                Sign in with email
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/', { replace: true })}
                className="w-full"
              >
                Back to home
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallbackPage;
