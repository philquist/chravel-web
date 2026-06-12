import { describe, expect, it } from 'vitest';
import {
  hasAuthStorageMarker,
  isAnonymousRootRoute,
  shouldUseMarketingBootstrap,
  storageContainsAuthMarker,
} from '@/lib/bootstrapShell';

const mockStorage = (keys: string[]): Storage =>
  ({
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
  }) as Storage;

describe('bootstrapShell', () => {
  describe('storageContainsAuthMarker', () => {
    it('detects Supabase auth keys in storage', () => {
      expect(storageContainsAuthMarker(mockStorage(['sb-jmjiyekmxwsxkfnqwyaa-auth-token']))).toBe(
        true,
      );
    });

    it('returns false when no auth keys exist', () => {
      expect(storageContainsAuthMarker(mockStorage(['theme', 'chravel_host_version']))).toBe(false);
    });
  });

  describe('isAnonymousRootRoute', () => {
    it('is true only for unauthenticated root', () => {
      expect(isAnonymousRootRoute('/', false)).toBe(true);
      expect(isAnonymousRootRoute('/', true)).toBe(false);
      expect(isAnonymousRootRoute('/auth', false)).toBe(false);
    });
  });

  describe('shouldUseMarketingBootstrap', () => {
    const base = {
      marketingSplitEnabled: true,
      pathname: '/',
      hasAuthMarker: false,
      isInstalledApp: false,
    };

    it('uses marketing shell for anonymous browser visitors on /', () => {
      expect(shouldUseMarketingBootstrap(base)).toBe(true);
    });

    it('skips marketing shell for installed/native/TestFlight surfaces', () => {
      expect(shouldUseMarketingBootstrap({ ...base, isInstalledApp: true })).toBe(false);
    });

    it('skips marketing shell when auth markers exist', () => {
      expect(shouldUseMarketingBootstrap({ ...base, hasAuthMarker: true })).toBe(false);
    });

    it('skips marketing shell when split is disabled', () => {
      expect(shouldUseMarketingBootstrap({ ...base, marketingSplitEnabled: false })).toBe(false);
    });

    it('skips marketing shell for non-root routes', () => {
      expect(shouldUseMarketingBootstrap({ ...base, pathname: '/trip/abc' })).toBe(false);
    });

    it('forceMarketing wins over auth marker, installed shell, and non-root path', () => {
      expect(
        shouldUseMarketingBootstrap({
          ...base,
          hasAuthMarker: true,
          isInstalledApp: true,
          pathname: '/trip/abc',
          forceMarketing: true,
        }),
      ).toBe(true);
    });

    it('forceMarketing still respects the marketingSplitEnabled kill switch', () => {
      expect(
        shouldUseMarketingBootstrap({
          ...base,
          marketingSplitEnabled: false,
          forceMarketing: true,
        }),
      ).toBe(false);
    });
  });

  describe('hasAuthStorageMarker', () => {
    it('checks localStorage, sessionStorage, and cookies', () => {
      expect(
        hasAuthStorageMarker({
          localStorage: mockStorage(['chravel-auth-session']),
          sessionStorage: null,
          cookieIncludes: () => false,
        }),
      ).toBe(true);

      expect(
        hasAuthStorageMarker({
          localStorage: mockStorage(['theme']),
          sessionStorage: null,
          cookieIncludes: needle => needle === 'sb-',
        }),
      ).toBe(true);
    });
  });
});
