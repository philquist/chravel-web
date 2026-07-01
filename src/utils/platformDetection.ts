/**
 * Centralized platform detection.
 * These are synchronous checks — context does not change during a session.
 */

/**
 * True when running inside the Capacitor native shell (TestFlight / Play Store builds).
 * Capacitor sets `window.Capacitor` and `isNativePlatform()` distinguishes real native
 * from `cap serve` / web. Relying only on WKWebView UA heuristics misses many iOS shell
 * configurations (Safari token present), which broke installed-app routing on `/`.
 */
export function isCapacitorNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
}

/**
 * True when running inside the chravel-mobile native WebView shell.
 * The shell injects `window.ChravelNative.isNative === true` and appends a
 * `ChravelNative/<version>` token to the user agent. Either signal is sufficient.
 * Bridge contract is documented in chravel-mobile/CLAUDE.md — do not rename.
 */
export function isChravelNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const native = (window as unknown as { ChravelNative?: { isNative?: boolean } }).ChravelNative;
  if (native?.isNative === true) return true;
  if (typeof navigator !== 'undefined' && /ChravelNative\//.test(navigator.userAgent || '')) {
    return true;
  }
  return false;
}

/**
 * True when running inside the chravel-mobile **iOS** native WebView shell.
 * The shell injects `window.ChravelNative.platform === 'ios'` (alongside
 * `isNative === true`) before page load. Used to force the native Sign in with
 * Apple sheet and FORBID the browser OAuth / PKCE fallback that App Review
 * rejected on iPhone/iPad (Guideline 2.1(a) — "Unable to exchange external code").
 * Bridge contract is documented in chravel-mobile/CLAUDE.md — do not rename.
 */
export function isChravelNativeIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const native = (window as unknown as { ChravelNative?: { platform?: string } }).ChravelNative;
  return native?.platform === 'ios';
}

/** True when running as an installed PWA in standalone display mode. */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * True when user-agent indicates a handheld/mobile device class.
 * Desktop browsers can report standalone display mode in certain launch contexts,
 * but we still want desktop marketing behavior on chravel.app.
 */
export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
}

/**
 * Heuristic for iOS WKWebView user agents: AppleWebKit present without Safari/Chrome/Firefox.
 * Kept in sync with `isNativeWebView()` so billing and shell detection agree on OS class.
 */
export function isLikelyIosWkWebViewUserAgent(userAgent: string): boolean {
  return (
    /AppleWebKit/.test(userAgent) &&
    !/Safari/.test(userAgent) &&
    !/Chrome|CriOS|Firefox|FxiOS/.test(userAgent)
  );
}

export type NativeBillingPlatform = 'web' | 'ios' | 'android';

export function detectNativeBillingPlatform(
  userAgent: string,
  nativeWebView: boolean,
): NativeBillingPlatform {
  if (!nativeWebView) return 'web';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/; wv\)/i.test(userAgent)) return 'android';
  if (isLikelyIosWkWebViewUserAgent(userAgent)) return 'ios';
  // Native shell but OS not inferable: fail closed for Play, never web checkout.
  return 'android';
}

/** True when running inside a native app's webview (Expo WebView, Android WebView, etc). */
export function isNativeWebView(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCapacitorNativeShell()) return true;
  // chravel-mobile (Expo) TestFlight shell: UA often includes "Safari" for compatibility,
  // which makes the WKWebView heuristic below false. Still must use installed-app OAuth
  // (skipBrowserRedirect + openInstalledAuthBrowser / ChravelNative.openOAuthUrl).
  if (isChravelNativeShell()) return true;
  // Explicit query param from chravel-mobile Expo WebView
  const params = new URLSearchParams(window.location.search);
  if (params.get('app_context') === 'native') return true;
  const ua = navigator.userAgent;
  // Android WebView
  if (/; wv\)/.test(ua)) return true;
  // iOS WKWebView: has AppleWebKit but no Safari token (and not Chrome/Firefox)
  if (isLikelyIosWkWebViewUserAgent(ua)) return true;
  return false;
}

/**
 * True when the app is running as an installed experience —
 * PWA standalone (any device) or native webview / Capacitor shell.
 * Marketing splash and browser-first auth gates should not apply here; use in-app auth shell.
 */
export function isInstalledApp(): boolean {
  if (isCapacitorNativeShell()) return true;
  // Native webview should always be treated as installed app context.
  if (isNativeWebView()) return true;
  // Any standalone PWA (mobile or desktop) is a first-class app surface — same auth/OAuth rules.
  return isStandalonePWA();
}

/**
 * Stricter than `isInstalledApp()` — only true for OUR real native shells
 * (Capacitor build, ChravelNative WebView) or an installed standalone PWA.
 *
 * Critically, this does NOT treat generic iOS WKWebViews (Instagram/Facebook
 * in-app browsers, embedded preview iframes) as installed. Those should see
 * the marketing homepage, not the in-app auth gate.
 */
export function isNativeAuthSurface(): boolean {
  if (isCapacitorNativeShell()) return true;
  if (isChravelNativeShell()) return true;
  if (isStandalonePWA()) return true;
  return false;
}

/**
 * True when running inside a native iOS shell (Capacitor or ChravelNative WebView on iOS).
 * Used to gate App Store 3.1.1 — no external purchase entry points on iOS.
 */
export function isIOSNativeShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!isNativeWebView()) return false;
  return detectNativeBillingPlatform(navigator.userAgent || '', true) === 'ios';
}
