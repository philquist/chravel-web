import { describe, it, expect, afterEach, vi } from 'vitest';
import { createDemoUser, getOAuthReturnTo, withTimeout } from '../authHelpers';

describe('createDemoUser', () => {
  it('returns a read-only guest with no write/admin privileges', () => {
    const demo = createDemoUser('demo-123');
    expect(demo.id).toBe('demo-123');
    expect(demo.permissions).toEqual(['read']);
    expect(demo.permissions).not.toContain('write');
    expect(demo.permissions).not.toContain('admin');
    expect(demo.proRole).toBe('guests');
    expect(demo.isPro).toBe(false);
  });

  it('uses the provided id verbatim so UUID-shaped code paths do not throw', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(createDemoUser(uuid).id).toBe(uuid);
  });
});

describe('getOAuthReturnTo', () => {
  const originalSearch = window.location.search;
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: originalSearch },
      writable: true,
    });
  });

  const setSearch = (search: string) => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search },
      writable: true,
    });
  };

  it('accepts a safe same-origin override path', () => {
    expect(getOAuthReturnTo('/join/abc')).toBe('/join/abc');
  });

  it('rejects protocol-relative override (open-redirect guard)', () => {
    setSearch('');
    expect(getOAuthReturnTo('//evil.com')).toBeNull();
  });

  it('rejects absolute-URL override', () => {
    setSearch('');
    expect(getOAuthReturnTo('https://evil.com')).toBeNull();
  });

  it('falls back to a safe returnTo query param', () => {
    setSearch('?returnTo=%2Ftrip%2F42');
    expect(getOAuthReturnTo()).toBe('/trip/42');
  });

  it('rejects an unsafe returnTo query param', () => {
    setSearch('?returnTo=' + encodeURIComponent('//evil.com'));
    expect(getOAuthReturnTo()).toBeNull();
  });
});

describe('withTimeout', () => {
  it('resolves the promise value when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'fallback')).resolves.toBe('ok');
  });

  it('resolves the fallback when the promise exceeds the timeout', async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('late'), 5000));
    const raced = withTimeout(slow, 50, 'fallback');
    await vi.advanceTimersByTimeAsync(60);
    await expect(raced).resolves.toBe('fallback');
    vi.useRealTimers();
  });
});
