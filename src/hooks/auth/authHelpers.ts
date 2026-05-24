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
  bio: 'Exploring Chravel in app preview mode.',
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
