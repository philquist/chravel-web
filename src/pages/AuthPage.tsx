import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthModal } from '@/components/AuthModal';
import { useAuth } from '@/hooks/useAuth';
import { notifyNativeShellReady } from '@/utils/nativeBridge';
import { clearPendingInviteCode, storePendingInviteCode } from '@/lib/pendingInviteStorage';

type AuthMode = 'signin' | 'signup';

function getSafeReturnTo(value: string | null, fallback: string): string {
  if (!value) return fallback;
  // Only allow same-origin relative paths.
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  return value;
}

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const returnTo = useMemo(() => {
    const fromQuery = searchParams.get('returnTo');
    // If caller used state, prefer it (more trustworthy).
    const fromState = (location.state as { returnTo?: string } | null)?.returnTo ?? null;
    return getSafeReturnTo(fromState ?? fromQuery, '/');
  }, [location.state, searchParams]);

  const mode = useMemo<AuthMode>(() => {
    const raw = searchParams.get('mode');
    return raw === 'signup' ? 'signup' : 'signin';
  }, [searchParams]);

  // Restore invite context from query param into the shared pending-invite store
  // so both auth resume and onboarding pickup read the same source of truth.
  useEffect(() => {
    const inviteCode = searchParams.get('invite');
    if (inviteCode) {
      storePendingInviteCode(inviteCode);
    }
  }, [searchParams]);

  // Signal the native WebView shell that the auth surface is mounted and interactive.
  // Fires before session validation completes so the shell can dismiss its splash
  // as soon as the user can tap the login form.
  useEffect(() => {
    notifyNativeShellReady({ surface: 'auth' });
  }, []);

  // If already authenticated, redirect — preferring invite join flow if invite code exists
  useEffect(() => {
    if (user && !authLoading) {
      const inviteCode = searchParams.get('invite');
      if (inviteCode) {
        // User just authenticated with an invite context — go straight to join
        navigate(`/join/${inviteCode}`, { replace: true });
      } else {
        navigate(returnTo, { replace: true });
      }
    }
  }, [user, authLoading, navigate, returnTo, searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <AuthModal
        isOpen={true}
        initialMode={mode}
        onClose={() => {
          clearPendingInviteCode();
          navigate(returnTo, { replace: true });
        }}
      />
    </div>
  );
};

export default AuthPage;
