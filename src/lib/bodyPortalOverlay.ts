import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Shared open/focus contracts for body-portaled search overlays inside
 * `.mobile-trip-shell` (Concierge Trip Search, Chat message search).
 *
 * iOS WKWebView drops or mis-routes focus when fixed overlays live under
 * trip-shell scroll/overflow ancestors. Opening on touch `pointerdown` also
 * races the completing `click` against a freshly mounted backdrop.
 */

/** Ignore backdrop dismiss for this long after open (pointerdown → click race). */
export const OVERLAY_OPEN_DISMISS_GUARD_MS = 400;

/** Delay before focusing the search field after the overlay becomes active. */
export const OVERLAY_INPUT_FOCUS_DELAY_MS = 50;

export function shouldIgnoreOverlayDismiss(
  openedAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - openedAtMs < OVERLAY_OPEN_DISMISS_GUARD_MS;
}

/**
 * Focus a search input after the overlay paints. Returns a cancel function for
 * effect cleanup. Moves the caret to the end so a fast reopen keeps typing natural.
 */
export function scheduleOverlayInputFocus(
  input: HTMLInputElement | null | undefined,
  delayMs: number = OVERLAY_INPUT_FOCUS_DELAY_MS,
): () => void {
  const timerId = window.setTimeout(() => {
    if (!input) return;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange?.(length, length);
  }, delayMs);

  return () => window.clearTimeout(timerId);
}

type TrustedOverlayOpenHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: () => void;
};

/**
 * Open an overlay from a trusted touch/pen gesture; mouse still uses click.
 * Use for trip-shell CTAs that mount a body-portal overlay (Search).
 */
export function getTrustedOverlayOpenHandlers(open: () => void): TrustedOverlayOpenHandlers {
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        open();
      }
    },
    onClick: open,
  };
}
