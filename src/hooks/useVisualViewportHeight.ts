import { useEffect, useState } from 'react';

/**
 * Tracks the live visual viewport height while `enabled`.
 * Used by bottom-sheet modals on pages that don't mount useKeyboardHandler
 * (e.g. trips list) so max-height matches the real visible area on iOS Safari.
 */
export function useVisualViewportHeight(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }

    const update = () => {
      setHeight(window.visualViewport?.height ?? window.innerHeight);
    };

    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return height;
}
