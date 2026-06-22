import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

vi.mock('@/services/hapticService', () => ({
  hapticService: {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  },
}));

/**
 * Regression coverage for the "scrolls in the opposite direction" bug.
 *
 * The mobile trip tabs scroll inside a nested container, so `window.scrollY` is
 * always 0 there. The old guard armed pull-to-refresh on every touch and called
 * preventDefault() on downward swipes, hijacking normal scrolling. The hook must
 * instead read the touched scroll container's own scrollTop and only arm at top.
 */
describe('usePullToRefresh — nested scroll container gating', () => {
  let container: HTMLDivElement;
  let target: HTMLDivElement;
  let scrollTopValue: number;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.overflowY = 'auto';
    // jsdom has no layout — fake a scrollable box so findScrollableAncestor matches.
    Object.defineProperty(container, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
    scrollTopValue = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: v => {
        scrollTopValue = v;
      },
    });

    target = document.createElement('div');
    container.appendChild(target);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  const fireTouch = (type: string, clientY: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientY }] });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it('arms the pull gesture when the container is at its top', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined), threshold: 80 }),
    );

    scrollTopValue = 0;
    fireTouch('touchstart', 100);
    const move = fireTouch('touchmove', 300); // swipe down 200px from the top

    expect(result.current.pullDistance).toBeGreaterThan(0);
    expect(move.defaultPrevented).toBe(true); // intercepted as a pull, as intended
  });

  it('does NOT arm (and does not preventDefault) when the container is scrolled down', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined), threshold: 80 }),
    );

    scrollTopValue = 50; // user is mid-list, not at the top
    fireTouch('touchstart', 100);
    const move = fireTouch('touchmove', 300); // same downward swipe should scroll normally

    expect(result.current.pullDistance).toBe(0);
    expect(move.defaultPrevented).toBe(false); // native scroll is left alone
  });
});
