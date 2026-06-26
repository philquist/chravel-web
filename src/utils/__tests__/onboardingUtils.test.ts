import { beforeEach, describe, expect, it } from 'vitest';
import { capturePendingDestination } from '../onboardingUtils';

describe('capturePendingDestination', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('preserves deep-link path with search + hash for auth resume', () => {
    window.history.replaceState({}, '', '/trip/abc123?tab=chat#message-99');

    expect(capturePendingDestination('/trip/abc123')).toBe('/trip/abc123?tab=chat#message-99');
  });

  it('captures branded share alias routes', () => {
    window.history.replaceState({}, '', '/t/trip-42');

    expect(capturePendingDestination('/t/trip-42')).toBe('/t/trip-42');
  });

  it('captures trip preview routes', () => {
    window.history.replaceState({}, '', '/trip/preview-id/preview?source=push');

    expect(capturePendingDestination('/trip/preview-id/preview')).toBe(
      '/trip/preview-id/preview?source=push',
    );
  });

  it('picks up pending invite code from mirrored invite storage', () => {
    localStorage.setItem('chravel_pending_invite_code', 'chravelinvite123');

    expect(capturePendingDestination('/')).toBe('/join/chravelinvite123');
    expect(sessionStorage.getItem('chravel_pending_invite_code')).toBe('chravelinvite123');
  });
});
