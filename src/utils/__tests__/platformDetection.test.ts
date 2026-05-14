import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCapacitorNativeShell,
  isChravelNativeShell,
  isInstalledApp,
  isLikelyMobileDevice,
  isNativeWebView,
  isStandalonePWA,
} from '@/utils/platformDetection';

const originalLocation = window.location;

const setUserAgent = (value: string) => {
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: value,
  });
};

const setMatchMedia = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
};

const setLocationSearch = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: {
      ...originalLocation,
      search,
    },
    configurable: true,
  });
};

describe('platformDetection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
    });
  });

  it('classifies desktop standalone PWA as installed app (auth shell, not marketing)', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    );
    setMatchMedia(true);
    setLocationSearch('');

    expect(isStandalonePWA()).toBe(true);
    expect(isLikelyMobileDevice()).toBe(false);
    expect(isInstalledApp()).toBe(true);
  });

  it('classifies mobile standalone context as installed app', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    setMatchMedia(true);
    setLocationSearch('');

    expect(isLikelyMobileDevice()).toBe(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('always treats native app_context as installed', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    );
    setMatchMedia(false);
    setLocationSearch('?app_context=native');

    expect(isNativeWebView()).toBe(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('treats ChravelNative Expo shell as installed when UA includes Safari (iOS WebView default)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ChravelNative/1',
    );
    setMatchMedia(false);
    setLocationSearch('');

    expect(isChravelNativeShell()).toBe(true);
    expect(isNativeWebView()).toBe(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('treats ChravelNative window flag as installed even when UA looks like mobile Safari', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    setMatchMedia(false);
    setLocationSearch('');
    (window as unknown as { ChravelNative: { isNative: boolean } }).ChravelNative = {
      isNative: true,
    };

    expect(isChravelNativeShell()).toBe(true);
    expect(isNativeWebView()).toBe(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('detects Capacitor TestFlight shell even when UA looks like mobile Safari', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    setMatchMedia(false);
    setLocationSearch('');
    Object.defineProperty(window, 'Capacitor', {
      value: { isNativePlatform: () => true },
      configurable: true,
    });

    expect(isCapacitorNativeShell()).toBe(true);
    expect(isNativeWebView()).toBe(true);
    expect(isInstalledApp()).toBe(true);
  });

  it('does not treat Capacitor web preview as native shell', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    );
    setMatchMedia(false);
    setLocationSearch('');
    Object.defineProperty(window, 'Capacitor', {
      value: { isNativePlatform: () => false },
      configurable: true,
    });

    expect(isCapacitorNativeShell()).toBe(false);
    expect(isNativeWebView()).toBe(false);
  });
});
