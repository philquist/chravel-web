import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { scheduleOverlayInputFocus, shouldIgnoreOverlayDismiss } from '@/lib/bodyPortalOverlay';

interface UseBodyPortalOverlayControlsOptions {
  /** True while the overlay should own focus / Escape / dismiss guard. */
  active: boolean;
  onClose: () => void;
  /** Optional search field to focus when `active` becomes true. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Optional cleanup when the overlay deactivates (e.g. clear query). */
  onDeactivate?: () => void;
}

/**
 * Shared focus + Escape + backdrop-dismiss guard for body-portaled overlays.
 * Pair with `createPortal(..., document.body)` so keyboard fields work under
 * `.mobile-trip-shell` on iOS WKWebView.
 */
export function useBodyPortalOverlayControls({
  active,
  onClose,
  inputRef,
  onDeactivate,
}: UseBodyPortalOverlayControlsOptions): {
  handleBackdropClose: () => void;
} {
  const openedAtRef = useRef(0);
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;

  useEffect(() => {
    if (!active) {
      onDeactivateRef.current?.();
      return;
    }

    openedAtRef.current = Date.now();
    return scheduleOverlayInputFocus(inputRef?.current ?? null);
  }, [active, inputRef]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onClose]);

  const handleBackdropClose = useCallback(() => {
    if (shouldIgnoreOverlayDismiss(openedAtRef.current)) return;
    onClose();
  }, [onClose]);

  return { handleBackdropClose };
}
