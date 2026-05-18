import { useEffect, useState } from 'react';

/**
 * Defers non-critical link preview enrichment until either:
 * - the browser is idle, or
 * - the user interacts with the surface.
 */
export function useLinkPreviewActivation(active = true): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!active) {
      setEnabled(false);
      return;
    }
    if (enabled) return;

    let cancelled = false;

    const enable = () => {
      if (!cancelled) setEnabled(true);
    };

    const onInteraction = () => enable();
    const interactionEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
    interactionEvents.forEach(eventName => {
      window.addEventListener(eventName, onInteraction, { once: true, passive: true });
    });

    let idleTimer: number | null = null;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(enable, { timeout: 1200 });
    } else {
      idleTimer = window.setTimeout(enable, 400);
    }

    return () => {
      cancelled = true;
      interactionEvents.forEach(eventName => {
        window.removeEventListener(eventName, onInteraction);
      });
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
    };
  }, [active, enabled]);

  return enabled;
}
