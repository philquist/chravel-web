import { useLayoutEffect, useRef, useState } from 'react';

interface ViewportAnchoredHeightOptions {
  /** Lower bound so pathologically short windows keep a usable panel (page scrolls instead). */
  minHeight?: number;
  /** Upper bound so very tall monitors don't produce an endless panel. */
  maxHeight?: number;
  /** Breathing room between the panel bottom and the viewport bottom. */
  bottomGap?: number;
  /** Only apply at or above this viewport width; below it `height` is undefined. */
  minViewportWidth?: number;
}

/**
 * Anchor an element's bottom edge to the viewport bottom by measuring its actual
 * top position, instead of guessing the header stack's height with a hardcoded
 * `calc(100vh - Npx)` offset.
 *
 * Why: the trip pages size their tab panel with fixed offsets (e.g. `100vh - 240px`)
 * plus a large `min-height`. The header above the panel varies (trip title,
 * description, member row), so the guess undercounts — and on laptop-height
 * viewports the min-height floor pushes the panel past the fold, clipping the
 * concierge composer and the voice overlay's controls. Measuring the real top
 * fixes every viewport and any future header change.
 *
 * Re-measures on window resize and on document body size changes (header
 * expanding/collapsing). The setState is change-guarded so the body
 * ResizeObserver can't feedback-loop.
 */
export function useViewportAnchoredHeight<T extends HTMLElement>({
  minHeight = 420,
  maxHeight = 1000,
  bottomGap = 16,
  minViewportWidth = 768,
}: ViewportAnchoredHeightOptions = {}): {
  ref: React.RefObject<T | null>;
  height: number | undefined;
} {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      if (window.innerWidth < minViewportWidth) {
        setHeight(undefined);
        return;
      }
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - bottomGap;
      const next = Math.round(Math.min(Math.max(available, minHeight), maxHeight));
      setHeight(prev => (prev === next ? prev : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(document.body);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [minHeight, maxHeight, bottomGap, minViewportWidth]);

  return { ref, height };
}
