/**
 * Open an OAuth URL from an installed-app context (Capacitor native shell or PWA).
 *
 * Prefers the native Capacitor Browser plugin when the native shell (chravel-mobile)
 * has registered it — that launches SFSafariViewController on iOS or Chrome Custom
 * Tabs on Android, which Google and Apple accept.
 *
 * Second, the chravel-mobile (Expo) shell can inject `window.ChravelNative.openOAuthUrl`
 * to run `WebBrowser.openAuthSessionAsync` / ASWebAuthenticationSession, then load the
 * callback URL in the **main** WebView so `detectSessionInUrl` shares the same
 * storage as the app. Without this or Capacitor Browser, the fallback is
 * `location.assign`, which replaces the WebView with the provider chain and often
 * strands the session (callback runs in a context the shell does not hand back).
 *
 * The WebView-embedded path is intentionally not supported: Google blocks it with
 * `disallowed_useragent`.
 */

type CapacitorBrowserPlugin = {
  open: (options: { url: string; presentationStyle?: 'popover' | 'fullscreen' }) => Promise<void>;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    Plugins?: {
      Browser?: CapacitorBrowserPlugin;
    };
  };
};

type ChravelNativeOAuthBridge = {
  openOAuthUrl?: (url: string) => void | Promise<void>;
};

function getCapacitorBrowser(): CapacitorBrowserPlugin | null {
  if (typeof window === 'undefined') return null;
  const plugin = (window as CapacitorWindow).Capacitor?.Plugins?.Browser;
  return plugin && typeof plugin.open === 'function' ? plugin : null;
}

function getChravelNativeOpenOAuthUrl(): ((url: string) => void | Promise<void>) | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as Window & { ChravelNative?: ChravelNativeOAuthBridge }).ChravelNative
    ?.openOAuthUrl;
  return typeof fn === 'function' ? fn : null;
}

export async function openInstalledAuthBrowser(url: string): Promise<void> {
  const browser = getCapacitorBrowser();
  if (browser) {
    await browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }

  const nativeOpen = getChravelNativeOpenOAuthUrl();
  if (nativeOpen) {
    await Promise.resolve(nativeOpen(url));
    return;
  }

  window.location.assign(url);
}
