import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardHandler } from '@/hooks/useKeyboardHandler';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

describe('useKeyboardHandler', () => {
  let visualViewportListeners: Map<string, Set<EventListener>>;
  let mockVisualViewport: {
    height: number;
    offsetTop: number;
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    visualViewportListeners = new Map();

    mockVisualViewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: (type, listener) => {
        if (!visualViewportListeners.has(type)) {
          visualViewportListeners.set(type, new Set());
        }
        visualViewportListeners.get(type)!.add(listener);
      },
      removeEventListener: (type, listener) => {
        visualViewportListeners.get(type)?.delete(listener);
      },
    };

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: mockVisualViewport,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });

    document.body.className = '';
    document.documentElement.style.cssText = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.className = '';
    document.documentElement.style.cssText = '';
  });

  const fireViewportResize = (height: number, offsetTop = 0) => {
    mockVisualViewport.height = height;
    mockVisualViewport.offsetTop = offsetTop;
    const listeners = visualViewportListeners.get('resize');
    listeners?.forEach(listener => listener(new Event('resize')));
  };

  it('sets viewport CSS vars when the keyboard opens', () => {
    renderHook(() => useKeyboardHandler({ adjustViewport: true }));

    act(() => {
      fireViewportResize(500);
    });

    expect(document.body.classList.contains('keyboard-visible')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('300px');
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe(
      '500px',
    );
  });

  it('does not scroll fixed bottom chat composers into view on focus', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderHook(() => useKeyboardHandler({ adjustViewport: true }));

    const tray = document.createElement('div');
    tray.className = 'chat-composer';
    const textarea = document.createElement('textarea');
    tray.appendChild(textarea);
    document.body.appendChild(tray);

    act(() => {
      textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(300);
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    tray.remove();
  });

  it('uses nearest scroll alignment for non-composer inputs', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderHook(() => useKeyboardHandler({ adjustViewport: true }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(300);
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    });
    input.remove();
  });
});
