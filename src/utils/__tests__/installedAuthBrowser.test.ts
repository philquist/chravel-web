import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInstalledAuthBrowser } from '@/utils/installedAuthBrowser';

describe('openInstalledAuthBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
  });

  it('uses Capacitor Browser when Plugins.Browser is available', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    (
      window as unknown as { Capacitor: { Plugins: { Browser: { open: typeof open } } } }
    ).Capacitor = { Plugins: { Browser: { open } } };

    await openInstalledAuthBrowser('https://oauth.example/start');

    expect(open).toHaveBeenCalledWith({
      url: 'https://oauth.example/start',
      presentationStyle: 'fullscreen',
    });
  });

  it('prefers Capacitor Browser over ChravelNative.openOAuthUrl', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    (
      window as unknown as { Capacitor: { Plugins: { Browser: { open: typeof open } } } }
    ).Capacitor = { Plugins: { Browser: { open } } };
    const nativeOpen = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { ChravelNative: { openOAuthUrl: typeof nativeOpen } }).ChravelNative = {
      openOAuthUrl: nativeOpen,
    };

    await openInstalledAuthBrowser('https://oauth.example/start');

    expect(open).toHaveBeenCalled();
    expect(nativeOpen).not.toHaveBeenCalled();
  });

  it('uses ChravelNative.openOAuthUrl when Capacitor Browser is missing', async () => {
    const nativeOpen = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { ChravelNative: { openOAuthUrl: typeof nativeOpen } }).ChravelNative = {
      openOAuthUrl: nativeOpen,
    };

    await openInstalledAuthBrowser('https://oauth.example/start');

    expect(nativeOpen).toHaveBeenCalledWith('https://oauth.example/start');
  });

  it('falls back to location.assign when no native opener exists', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    const result = await openInstalledAuthBrowser('https://oauth.example/start');

    expect(assign).toHaveBeenCalledWith('https://oauth.example/start');
    expect(result).toEqual({ strategy: 'web-redirect' });
  });

  it('refuses location.assign when native shell is detected but openOAuthUrl bridge is missing', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    (window as unknown as { ChravelNative: { isNative: boolean } }).ChravelNative = {
      isNative: true,
    };

    const result = await openInstalledAuthBrowser('https://oauth.example/start');

    expect(assign).not.toHaveBeenCalled();
    expect(result).toEqual({
      strategy: 'native-shell-missing-bridge',
      url: 'https://oauth.example/start',
    });
  });
});
