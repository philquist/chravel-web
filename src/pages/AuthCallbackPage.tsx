import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Dedicated OAuth callback handler.
 *
 * Apple/Google redirect here with either:
 *   - PKCE: `?code=...&state=...` (current default — see supabase client config)
 *   - Legacy implicit: `#access_token=...&refresh_token=...`
 *
 * In the chravel-mobile WebView shell (App Store 2.1a rejection), the
 * provider redirect lands in an ASWebAuthenticationSession that is then
 * handed back to the main WebView. If we silently rely on `detectSessionInUrl`
 * and the session does not land within a couple seconds, the parent `AuthPage`
 * bounces the user back to `/auth` (the failure mode App Review observed).
 *
 * This page explicitly:
 *   1. Calls `exchangeCodeForSession(window.location.href)` for PKCE
 *   2. Polls `getSession()` up to ~3s as a safety net for hash flow
 *   3. On success → navigates to `returnTo` (default `/`)
 *   4. On failure → shows an actionable error + "Sign in with email" fallback,
 *      never silently sends the user back to the login screen
 */

function getSafeReturnTo(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  return value;
}

type Status = 'exchanging' | 'success' | 'error';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('exchanging');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnTo = getSafeReturnTo(searchParams.get('returnTo'), '/');

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        const href = window.location.href;
        const hasCode = searchParams.has('code');
        const hasHash = window.location.hash.includes('access_token');

        // PKCE: exchange the authorization code for a session.
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error && !hasHash) {
            // Some providers send `error_description` on cancellation/denial.
            const description =
              searchParams.get('error_description') || error.message || 'Sign-in failed.';
            if (!cancelled) {
              setErrorMessage(description);
              setStatus('error');
            }
            return;
          }
        }

        // Safety net: poll for a session for up to ~3s. Covers both hash flow
        // (detectSessionInUrl runs async) and slow native bridge handoffs.
        for (let attempt = 0; attempt < 12; attempt++) {
          if (cancelled) return;
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            if (!cancelled) {
              setStatus('success');
              navigate(returnTo, { replace: true });
            }
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (!cancelled) {
          setErrorMessage(
            "We couldn't complete sign-in. Please try again, or use email and password.",
          );
          setStatus('error');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unexpected error completing sign-in.',
          );
          setStatus('error');
        }
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
