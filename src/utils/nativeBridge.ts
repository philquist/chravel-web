/**
 * Native bridge for the chravel-mobile WebView shell.
 *
 * Bridge contract (mirrored in chravel-mobile/CLAUDE.md):
 *   - Shell injects `window.ChravelNative.isNative === true` and a `ChravelNative/<v>`
 *     UA suffix before loading the web app.
 *   - Web app emits `{ type: 'ready', source: 'chravel-web', route, timestamp }` once
 *     the first interactive surface is mounted.
 *   - Message names ('ready', 'chravel-web' source) are part of the contract — do
 *     not rename without updating chravel-mobile in lockstep.
 *   - Optional Settings: `window.ChravelNative.openAppSettings()` and/or
 *     `openNotificationSettings()` — used by Permissions Center when the OS has
 *     denied a capability (see `src/lib/webPermissions.ts`). Implement in the shell
 *     when `App.openUrl` / Capacitor is not available.
 *   - Optional OAuth: `window.ChravelNative.openOAuthUrl(url)` — native should open
 *     the provider URL in an auth session (e.g. Expo `WebBrowser.openAuthSessionAsync`),
 *     then navigate the **main** WebView to `https://chravel.app/auth-callback?...` /
 *     hash so Supabase `detectSessionInUrl` completes in-app. Used when Capacitor
 *     `Plugins.Browser` is not present (typical Expo shell).
 *   - Optional native Apple Sign In: `window.ChravelNative.signInWithApple(): Promise<{
 *     identityToken, rawNonce, email?, fullName?, authorizationCode? }>` — the shell runs
 *     the native `ASAuthorization` flow, generating a random `rawNonce` and sending
 *     `SHA256(rawNonce)` as the request nonce, and returns the RAW nonce + identity token.
 *     The web app authenticates via `supabase.auth.signInWithIdToken` (see
 *     `src/utils/nativeAppleSignIn.ts`), skipping the SFSafariViewController /
 *     Universal-Link round-trip that App Review flagged on iPad (Guideline 2.1(a)). When
 *     absent, the web OAuth flow remains the fallback.
 */

import { isChravelNativeShell } from './platformDetection';

interface NativeBridgePostMessage {
  postMessage?: (payload: string) => void;
}

interface WebkitMessageHandlers {
  ChravelNative?: { postMessage?: (payload: unknown) => void };
}

let readyDispatched = false;

export interface NativeReadyOptions {
  /** Logical surface that became interactive (e.g. "auth", "trip"). Defaults to current pathname. */
  surface?: string;
}

/**
 * Notify the native shell that the current surface is mounted and interactive.
 * Idempotent: safe to call multiple times — only the first call dispatches.
 * No-op outside the chravel-mobile shell.
 */
export function notifyNativeShellReady(options: NativeReadyOptions = {}): void {
  if (readyDispatched) return;
  if (typeof window === 'undefined') return;
  if (!isChravelNativeShell()) return;

  const message = {
    type: 'ready' as const,
    source: 'chravel-web' as const,
    surface: options.surface ?? window.location.pathname,
    timestamp: Date.now(),
  };

  try {
    const native = (window as unknown as { ChravelNative?: NativeBridgePostMessage }).ChravelNative;
    if (typeof native?.postMessage === 'function') {
      native.postMessage(JSON.stringify(message));
      readyDispatched = true;
      return;
    }
    const webkit = (window as unknown as { webkit?: { messageHandlers?: WebkitMessageHandlers } })
      .webkit;
    if (typeof webkit?.messageHandlers?.ChravelNative?.postMessage === 'function') {
      webkit.messageHandlers.ChravelNative.postMessage(message);
      readyDispatched = true;
      return;
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[NativeBridge] ready dispatch failed', err);
    }
  }
}

/** Test-only: reset the latch so unit tests can re-trigger dispatch. */
export function __resetNativeBridgeForTests(): void {
  readyDispatched = false;
}
