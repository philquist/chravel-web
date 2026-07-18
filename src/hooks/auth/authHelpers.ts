import { isInstalledApp } from '@/utils/platformDetection';
import type { AuthUser } from './types';

/** Race a promise against a timeout, resolving the fallback if it elapses. */
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
};

/**
 * Resolve a safe, same-origin `returnTo` path for OAuth redirects.
 * Rejects protocol-relative (`//evil.com`) and absolute URLs to prevent open redirects.
 */
export const getOAuthReturnTo = (returnToOverride?: string): string | null => {
  if (returnToOverride && returnToOverride.startsWith('/') && !returnToOverride.startsWith('//')) {
    return returnToOverride;
  }

  const queryReturnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (queryReturnTo && queryReturnTo.startsWith('/') && !queryReturnTo.startsWith('//')) {
    return queryReturnTo;
  }

  return null;
};

/**
 * Resolve the OAuth `redirectTo` for a browser-based provider sign-in (Google, and the
 * non-iOS Apple web fallback).
 *
 * - Browser: same-origin `/auth` so `detectSessionInUrl` completes in-page.
 * - chravel-mobile native shell (`window.ChravelNative.isNative`): the
 *   `chravel://auth-callback` custom scheme. The shell rewrites `redirect_to` to this and
 *   captures the callback natively via ASWebAuthenticationSession — no WebView round-trip.
 * - Other installed surfaces (Capacitor / PWA): the `https://chravel.app/auth-callback`
 *   Universal Link the wrapper hands back into the WebView.
 */
export const getOAuthRedirectUrl = (returnTo: string | null): string => {
  const returnToQuery = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';

  if (!isInstalledApp()) {
    return `${window.location.origin}/auth${returnToQuery}`;
  }

  // If the chravel-mobile shell exposes the ASWebAuthenticationSession bridge, use the
  // `chravel://` custom scheme — that scheme is what causes the auth session to
  // auto-dismiss and hand the callback URL back to the main WebView. Without it,
  // Google's account picker stays open indefinitely.
  const chravelNative =
    typeof window !== 'undefined'
      ? (window as Window & {
          ChravelNative?: { isNative?: boolean; openOAuthUrl?: (url: string) => unknown };
        }).ChravelNative
      : undefined;

  if (chravelNative?.isNative && typeof chravelNative.openOAuthUrl === 'function') {
    return `chravel://auth-callback${returnToQuery}`;
  }

  // Capacitor / PWA fallback: Universal Link handed back by the wrapper.
  return `https://chravel.app/auth-callback${returnToQuery}`;
};

/**
 * Build the stable demo user for app-preview mode. Read-only guest access only —
 * server-side RLS and demo-mode gating prevent real mutations.
 */
export const createDemoUser = (demoUserId: string): AuthUser => ({
  id: demoUserId,
  email: 'demo@chravel.com',
  phone: undefined,
  displayName: 'Demo User',
  realName: undefined,
  namePreference: 'display',
  hasCompletedProfileSetup: true,
  firstName: 'Demo',
  lastName: 'User',
  avatar: '',
  bio: 'Exploring ChravelApp in app preview mode.',
  isPro: false,
  showEmail: false,
  showPhone: false,
  proRole: 'guests',
  organizationId: undefined,
  permissions: ['read'],
  notificationSettings: {
    messages: true,
    broadcasts: true,
    tripUpdates: true,
    email: false,
    push: false,
  },
});
