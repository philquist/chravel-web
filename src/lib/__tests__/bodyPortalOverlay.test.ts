import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OVERLAY_OPEN_DISMISS_GUARD_MS,
  getTrustedOverlayOpenHandlers,
  scheduleOverlayInputFocus,
  shouldIgnoreOverlayDismiss,
} from '../bodyPortalOverlay';

describe('bodyPortalOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guards backdrop dismiss only inside the open window', () => {
    const openedAt = 1_000;
    expect(shouldIgnoreOverlayDismiss(openedAt, openedAt + 10)).toBe(true);
    expect(shouldIgnoreOverlayDismiss(openedAt, openedAt + OVERLAY_OPEN_DISMISS_GUARD_MS - 1)).toBe(
      true,
    );
    expect(shouldIgnoreOverlayDismiss(openedAt, openedAt + OVERLAY_OPEN_DISMISS_GUARD_MS)).toBe(
      false,
    );
  });

  it('opens on touch/pen pointerdown and always on click', () => {
    const open = vi.fn();
    const handlers = getTrustedOverlayOpenHandlers(open);

    handlers.onPointerDown({ pointerType: 'mouse' } as never);
    expect(open).not.toHaveBeenCalled();

    handlers.onPointerDown({ pointerType: 'touch' } as never);
    expect(open).toHaveBeenCalledTimes(1);

    handlers.onPointerDown({ pointerType: 'pen' } as never);
    expect(open).toHaveBeenCalledTimes(2);

    handlers.onClick();
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('focuses the input after the open delay and moves the caret to the end', () => {
    const input = document.createElement('input');
    input.value = 'hi';
    const focus = vi.spyOn(input, 'focus');
    const setSelectionRange = vi.spyOn(input, 'setSelectionRange');

    const cancel = scheduleOverlayInputFocus(input, 50);
    expect(focus).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(setSelectionRange).toHaveBeenCalledWith(2, 2);

    cancel();
  });
});
