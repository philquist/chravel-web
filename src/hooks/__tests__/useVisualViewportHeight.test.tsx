import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisualViewportHeight } from '../useVisualViewportHeight';

describe('useVisualViewportHeight', () => {
  let listeners: Map<string, Set<EventListener>>;

  beforeEach(() => {
    listeners = new Map();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 720,
        addEventListener: (type: string, listener: EventListener) => {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(listener);
        },
        removeEventListener: (type: string, listener: EventListener) => {
          listeners.get(type)?.delete(listener);
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when disabled', () => {
    const { result } = renderHook(() => useVisualViewportHeight(false));
    expect(result.current).toBeNull();
  });

  it('tracks visualViewport.height while enabled', () => {
    const { result } = renderHook(() => useVisualViewportHeight(true));
    expect(result.current).toBe(720);
  });

  it('updates on visualViewport resize', () => {
    const { result } = renderHook(() => useVisualViewportHeight(true));

    act(() => {
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true,
        value: 640,
      });
      listeners.get('resize')?.forEach(listener => listener(new Event('resize')));
    });

    expect(result.current).toBe(640);
  });
});
