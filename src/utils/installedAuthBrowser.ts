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
  isNative?: boolean;
};

function getCapacitorBrowser(): CapacitorBrowserPlugin | null {
  if (typeof window === 'undefined') return null;
  const plugin = (window as CapacitorWindow).Capacitor?.Plugins?.Browser;
  return plugin && typeof plugin.open === 'function' ? plugin : null;
}

function getChravelNative(): ChravelNativeOAuthBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { ChravelNative?: ChravelNativeOAuthBridge }).ChravelNative;
  return bridge ?? null;
}

export type InstalledAuthBrowserResult =
  | { strategy: 'capacitor' | 'native-bridge' | 'web-redirect' }
  | { strategy: 'native-shell-missing-bridge'; url: string };

/**
 * Open an OAuth URL from an installed-app context. Returns the strategy used so
 * callers can surface a friendly message when we detect the native shell but the
 * `ChravelNative.openOAuthUrl` bridge is missing (older shell build) — in that
 * case we DO NOT call `location.assign`, which would replace the WebView with
 * the Apple/Google chain and strand the user (App Store 2.1(a)).
 */
export async function openInstalledAuthBrowser(url: string): Promise<InstalledAuthBrowserResult> {
  const browser = getCapacitorBrowser();
  if (browser) {
    await browser.open({ url, presentationStyle: 'fullscreen' });
    return { strategy: 'capacitor' };
  }

  const native = getChravelNative();
  if (native?.openOAuthUrl) {
    await Promise.resolve(native.openOAuthUrl(url));
    return { strategy: 'native-bridge' };
  }

  // Native shell detected but no OAuth bridge — refuse the unsafe location.assign
  // fallback and let the caller surface an actionable message to the user.
  if (native?.isNative) {
    return { strategy: 'native-shell-missing-bridge', url };
  }

  window.location.assign(url);
  return { strategy: 'web-redirect' };
}
