import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authEvents } from '@/telemetry/events';
import { supabase } from '@/integrations/supabase/client';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional initial mode. Useful for deep links that want to land on Sign Up directly.
   * Defaults to 'signin' to preserve existing behavior.
   */
  initialMode?: 'signin' | 'signup';
  /**
   * Optional post-auth destination. Invite flows use this to return directly to
   * the join route after Google/Apple complete the redirect, and it also seeds
   * the email-confirmation redirect for email signups started on routes (like
   * /join/:token) that carry no ?returnTo= query.
   */
  oauthReturnTo?: string;
  onAuthSuccess?: () => void;
}

export const AuthModal = ({
  isOpen,
  onClose,
  initialMode,
  oauthReturnTo,
  onAuthSuccess,
}: AuthModalProps) => {
  const { signIn, signInWithGoogle, signInWithApple, signUp, resetPassword, isLoading, user } =
    useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  // Track when we're waiting for auth state to update after successful sign-in
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const oauthLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearOAuthLoading = () => {
    if (oauthLoadingTimeoutRef.current) {
      clearTimeout(oauthLoadingTimeoutRef.current);
      oauthLoadingTimeoutRef.current = null;
    }
    setGoogleLoading(false);
    setAppleLoading(false);
  };

  const startOAuthLoading = (provider: 'google' | 'apple') => {
    if (oauthLoadingTimeoutRef.current) {
      clearTimeout(oauthLoadingTimeoutRef.current);
    }
    if (provider === 'google') {
      setGoogleLoading(true);
      setAppleLoading(false);
    } else {
      setAppleLoading(true);
      setGoogleLoading(false);
    }
    // Installed shells open an external auth session and return to this WebView.
    // If the user dismisses Google/Apple without completing sign-in, loading must
    // not stay stuck on "Redirecting…" (App Store 2.1a / passkey cancel path).
    oauthLoadingTimeoutRef.current = setTimeout(() => {
      oauthLoadingTimeoutRef.current = null;
      setGoogleLoading(false);
      setAppleLoading(false);
    }, 45_000);
  };

  const requestDismiss = () => {
    if (awaitingAuth) return;
    onClose();
  };

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isOpen || awaitingAuth) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, awaitingAuth, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode ?? 'signin');
    setError('');
    setSuccess('');
    setResetEmailSent(false);
    setAwaitingAuth(false);
    clearOAuthLoading();
  }, [isOpen, initialMode]);

  // When an installed app returns from the external OAuth browser without a session,
  // unstick provider buttons so email/password sign-in remains usable.
  useEffect(() => {
    if (!isOpen || (!googleLoading && !appleLoading)) return;

    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;

      window.setTimeout(() => {
        void (async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user) return;
          clearOAuthLoading();
          setError(prev => {
            if (prev) return prev;
            return "Sign-in didn't complete. Try Google again, or sign in with email.";
          });
        })();
      }, 750);
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isOpen, googleLoading, appleLoading]);

  // Close modal immediately if user is already authenticated when modal opens
  // Also close when user becomes authenticated after sign-in attempt
  useEffect(() => {
    if (user && isOpen) {
      // User is authenticated, close the modal immediately
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      setAwaitingAuth(false);
      onClose();
      onAuthSuccess?.();
    }
  }, [user, isOpen, onClose]);

  // Safety timeout: if auth takes too long, still close the modal
  useEffect(() => {
    if (awaitingAuth) {
      closeTimeoutRef.current = setTimeout(() => {
        // Force close after 5 seconds even if user state hasn't updated
        // (defensive measure - auth state listener should have fired by now)
        setAwaitingAuth(false);
        onClose();
      }, 5000);

      return () => {
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
      };
    }
  }, [awaitingAuth, onClose]);

  if (!isOpen || !isPortalReady) return null;

  const authHeading =
    mode === 'forgot' ? 'Reset Password' : mode === 'signup' ? 'Create Account' : 'ChravelApp';

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      let result;
      if (mode === 'signup') {
        authEvents.signupStarted('email');
        result = await signUp(email, password, firstName, lastName, oauthReturnTo);
      } else {
        authEvents.loginStarted('email');
        result = await signIn(email, password);
      }

      if (result.error) {
        if (mode === 'signup') {
          authEvents.signupFailed('email', result.error);
        } else {
          authEvents.loginFailed('email', result.error);
        }
        setError(result.error);
        if (mode === 'signup' && result.error.toLowerCase().includes('already')) {
          setMode('signin');
        }
        if (mode === 'signin' && result.error.toLowerCase().includes('invalid email or password')) {
          setError(
            'Invalid email or password. If you signed up with Google or Apple, use that option instead.',
          );
          return;
        }
        return;
      }

      if (result.success) {
        // Sign-up confirmation email sent — user_id captured by identify() on auth state change
        if (mode === 'signup') {
          authEvents.signupCompleted('email', '');
        }
        setSuccess(result.success);
        return; // Keep modal open to show success message (sign-up confirmation)
      }

      // Sign-in successful — user_id captured by identify() on auth state change
      if (mode !== 'signup') {
        authEvents.loginCompleted('email', '');
      }

      // Sign-in successful - wait for auth state to update before closing
      // This prevents the "nothing happens" issue where modal closes before user state updates
      setAwaitingAuth(true);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Auth error:', error);
      }
      setError('An unexpected error occurred');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await resetPassword(email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setResetEmailSent(true);
    } catch (error) {
      console.error('Reset password error:', error);
      setError('An unexpected error occurred');
    }
  };

  const renderForgotPassword = () => (
    <div className="space-y-4">
      <button
        onClick={() => {
          setMode('signin');
          setResetEmailSent(false);
          setError('');
        }}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={16} />
        <span className="text-sm">Back to Sign In</span>
      </button>

      {resetEmailSent ? (
        <div className="text-center space-y-4">
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-200">
            Check your email for a password reset link
          </div>
          <button
            onClick={() => {
              setMode('signin');
              setResetEmailSent(false);
            }}
            className="text-primary hover:text-gold-light transition-colors"
          >
            Return to Sign In
          </button>
        </div>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">Email</label>
            <div className="relative">
              <Mail
                size={20}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                autoComplete="email"
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-base text-white placeholder-white/60 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gold-metallic font-semibold py-3 rounded-xl hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 min-h-[44px]"
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}
    </div>
  );

  const renderEmailForm = () => (
    <form onSubmit={handleEmailAuth} className="space-y-4 pb-2">
      {mode === 'signup' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="John"
                required
                autoComplete="given-name"
                inputMode="text"
                enterKeyHint="next"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-base text-white placeholder-white/60 focus:outline-none focus:border-primary min-h-[48px]"
              />
            </div>
            <div>
              <label className="block text-white text-sm font-medium mb-2">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Doe"
                required
                autoComplete="family-name"
                inputMode="text"
                enterKeyHint="next"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-base text-white placeholder-white/60 focus:outline-none focus:border-primary min-h-[48px]"
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="block text-white text-sm font-medium mb-2">Email</label>
        <div className="relative">
          <Mail
            size={20}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus={mode === 'signin'}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-base text-white placeholder-white/60 focus:outline-none focus:border-primary min-h-[48px]"
          />
        </div>
      </div>

      <div>
        <label className="block text-white text-sm font-medium mb-2">Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            enterKeyHint={mode === 'signup' ? 'done' : 'go'}
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-4 pr-10 py-3 text-base text-white placeholder-white/60 focus:outline-none focus:border-primary min-h-[48px]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {mode === 'signin' && (
          <div className="flex justify-end items-center mt-2">
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError('');
              }}
              className="text-xs text-primary hover:text-gold-light transition-colors"
            >
              Forgot password?
            </button>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || awaitingAuth}
        className="w-full bg-gold-metallic font-semibold tracking-wide py-3 rounded-xl hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 min-h-[44px]"
      >
        {awaitingAuth
          ? 'Signing you in...'
          : isLoading
            ? 'Loading...'
            : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
      </button>

      {mode === 'signup' && (
        <p className="text-center text-xs text-white/50 pt-1">
          By creating an account, you agree to our{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-gold-light underline"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-gold-light underline"
          >
            Privacy Policy
          </a>
          .
        </p>
      )}
    </form>
  );

  return createPortal(
    <div
      data-testid="auth-modal-backdrop"
      data-marketing="true"
      className="fixed inset-0 z-[100] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
      onClick={requestDismiss}
    >
      {/* Full-viewport scrim: underlying routes (e.g. JoinTrip hero badge) must not read as a second logo */}
      <div
        className="absolute inset-0 bg-slate-950 pointer-events-auto"
        aria-hidden
        data-testid="auth-modal-scrim"
      />
      <div className="relative flex min-h-full w-full items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          data-testid="auth-modal-content"
          className="w-full max-w-md pointer-events-auto"
          onClick={event => event.stopPropagation()}
        >
          <div className="dark-section bg-slate-950/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-6 sm:p-8 animate-scale-in max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] overflow-y-auto">
            <div className="flex flex-col items-center mb-2" data-testid="auth-modal-logo" />

            <div className="relative flex items-center justify-center mb-6 min-h-[2.5rem]">
              <h2
                id="auth-modal-heading"
                className="text-3xl font-display font-normal tracking-tight text-white text-center px-10"
              >
                {authHeading}
              </h2>
              <button
                onClick={requestDismiss}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
                aria-label="Close"
                type="button"
              >
                <X size={24} />
              </button>
            </div>

            {success && (
              <div
                data-auth-message
                className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-200 text-sm animate-fade-in"
              >
                <p className="font-medium mb-1">✓ {success}</p>
                <p className="text-xs text-green-300/80 mt-1">
                  You can close this and sign in once confirmed.
                </p>
              </div>
            )}

            {error && (
              <div
                data-auth-message
                className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm animate-fade-in"
              >
                <p className="font-medium mb-1">{error}</p>
                {error.includes('email') && (
                  <p className="text-xs text-red-300/80 mt-1">
                    Check your email for a confirmation link
                  </p>
                )}
              </div>
            )}

            {/* Tab Navigation - Only show for signin/signup */}
            {mode !== 'forgot' && (
              <div
                className="flex rounded-xl bg-black/35 border border-white/10 p-1 mb-6 gap-1"
                role="tablist"
                aria-label="Sign in or create account"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  onClick={() => {
                    setMode('signin');
                    setError('');
                  }}
                  className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-light/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                    mode === 'signin' ? 'bg-gold-metallic' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-light/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                    mode === 'signup' ? 'bg-gold-metallic' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sign up
                </button>
              </div>
            )}

            {mode === 'forgot' ? (
              renderForgotPassword()
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Google OAuth Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      startOAuthLoading('google');
                      setError('');
                      if (mode === 'signup') {
                        authEvents.signupStarted('google');
                      } else {
                        authEvents.loginStarted('google');
                      }
                      try {
                        const result = await signInWithGoogle(oauthReturnTo);
                        if (result.error) {
                          if (mode === 'signup') {
                            authEvents.signupFailed('google', result.error);
                          } else {
                            authEvents.loginFailed('google', result.error);
                          }
                          setError(result.error);
                        }
                        // Installed shells keep this WebView mounted while OAuth runs
                        // externally — always clear loading so the form stays usable.
                      } finally {
                        clearOAuthLoading();
                      }
                    }}
                    disabled={isLoading || googleLoading || appleLoading || awaitingAuth}
                    className="w-full flex items-center justify-center gap-2 bg-white/12 hover:bg-white/18 border border-white/15 text-white font-medium py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all disabled:opacity-50 min-h-[48px]"
                  >
                    {googleLoading ? (
                      <div className="w-5 h-5 animate-spin gold-gradient-spinner" />
                    ) : (
                      <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    <span>{googleLoading ? 'Redirecting…' : 'Google'}</span>
                  </button>

                  {/* Apple OAuth Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      startOAuthLoading('apple');
                      setError('');
                      if (mode === 'signup') {
                        authEvents.signupStarted('apple');
                      } else {
                        authEvents.loginStarted('apple');
                      }
                      try {
                        const result = await signInWithApple(oauthReturnTo);
                        if (result.error) {
                          if (mode === 'signup') {
                            authEvents.signupFailed('apple', result.error);
                          } else {
                            authEvents.loginFailed('apple', result.error);
                          }
                          setError(result.error);
                        }
                      } finally {
                        clearOAuthLoading();
                      }
                    }}
                    disabled={isLoading || appleLoading || googleLoading || awaitingAuth}
                    className="w-full flex items-center justify-center gap-2 bg-white/12 hover:bg-white/18 border border-white/15 text-white font-medium py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all disabled:opacity-50 min-h-[48px]"
                  >
                    {appleLoading ? (
                      <div className="w-5 h-5 animate-spin gold-gradient-spinner" />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        className="flex-shrink-0"
                        fill="currentColor"
                      >
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.64-2.2.45-3.06-.4C3.79 16.17 4.36 9.53 8.7 9.31c1.24.06 2.1.7 2.82.73.99-.2 1.94-.78 3-.83 1.4.06 2.42.56 3.14 1.48-2.8 1.73-2.15 5.53.56 6.68-.5 1.39-1.18 2.74-2.17 3.91zM12.04 9.25C11.88 7.15 13.58 5.4 15.5 5.25c.28 2.38-2.13 4.2-3.46 4z" />
                      </svg>
                    )}
                    <span>{appleLoading ? 'Redirecting...' : 'Apple'}</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-white/20" />
                  <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-white/20" />
                </div>
                {renderEmailForm()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
