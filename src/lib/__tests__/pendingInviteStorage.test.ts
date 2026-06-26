import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingInviteCode,
  getPendingInviteCode,
  PENDING_INVITE_KEY,
  storePendingInviteCode,
} from '../pendingInviteStorage';

describe('pendingInviteStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('stores invite code in both session and local storage', () => {
    storePendingInviteCode('chravelabc123');

    expect(sessionStorage.getItem(PENDING_INVITE_KEY)).toBe('chravelabc123');
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('chravelabc123');
  });

  it('prefers session storage and mirrors it back to local storage', () => {
    sessionStorage.setItem(PENDING_INVITE_KEY, 'from-session');
    localStorage.setItem(PENDING_INVITE_KEY, 'from-local');

    expect(getPendingInviteCode()).toBe('from-session');
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('from-session');
  });

  it('falls back to local storage and mirrors it into session storage', () => {
    localStorage.setItem(PENDING_INVITE_KEY, 'from-local');

    expect(getPendingInviteCode()).toBe('from-local');
    expect(sessionStorage.getItem(PENDING_INVITE_KEY)).toBe('from-local');
  });

  it('clears invite code from both storage locations', () => {
    storePendingInviteCode('chravelabc123');

    clearPendingInviteCode();

    expect(sessionStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });
});
