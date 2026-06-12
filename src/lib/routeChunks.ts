/**
 * Route-chunk manifest — single source of truth for boot-time chunk warm-up.
 *
 * App.tsx's lazy() routes and main.tsx's cold-start warm-up must reference the
 * SAME import() loader so the chunk warmed at boot is guaranteed to be the chunk
 * the router renders (mirrors the tabChunkPreloader pattern). If the two drift,
 * boot warms a dead chunk and the real route pays the full serial round trip —
 * a silent perf regression.
 */

export const importAuthPage = () => import('@/pages/AuthPage');

/**
 * Path prefix → chunk loader pairs warmed at boot, in parallel with the App.tsx
 * chunk itself. Keep entries limited to cold-start-critical routes: every entry
 * competes with App.tsx for bandwidth on the slowest devices.
 */
const BOOT_WARMUP_CHUNKS: Array<{ prefix: string; load: () => Promise<unknown> }> = [
  // AuthPage otherwise waits behind App.tsx parse + AuthProvider mount before its
  // own chunk request even leaves the device — a serial round trip on the slowest
  // part of the cold-start path inside the native WebView shell.
  { prefix: '/auth', load: importAuthPage },
];

/**
 * Kick off chunk downloads for the route the user is cold-starting on.
 * Failures are silent — the route's own lazy() import (with retryImport)
 * handles real load failures.
 */
export function warmRouteChunksForPath(pathname: string): void {
  for (const entry of BOOT_WARMUP_CHUNKS) {
    if (pathname.startsWith(entry.prefix)) {
      entry.load().catch(() => {
        // Silent — see above.
      });
    }
  }
}
