import { useEffect, useMemo, useState } from 'react';
import { hasPaidAccess, type PaidAccessStatus, type PaidAccessTier } from '@/utils/paidAccess';

interface DeferredPaidAccessInput {
  tier?: PaidAccessTier | null;
  status?: PaidAccessStatus | null;
  isSuperAdmin?: boolean;
  active?: boolean;
}

/**
 * Defers non-critical paid-check computation until the user interacts
 * or the browser reaches idle.
 */
export function useDeferredPaidAccess({
  tier,
  status,
  isSuperAdmin,
  active = true,
}: DeferredPaidAccessInput): boolean {
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
      (window as Window).requestIdleCallback(enable, { timeout: 1200 });
    } else {
      idleTimer = (window as Window).setTimeout(enable, 400) as unknown as number;
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

  return useMemo(() => {
    if (!enabled) return false;
    return hasPaidAccess({ tier, status, isSuperAdmin });
  }, [enabled, isSuperAdmin, status, tier]);
}
