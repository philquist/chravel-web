import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('alpha', 300));
    expect(result.current).toBe('alpha');
  });

  it('updates after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'alpha' },
    });

    rerender({ value: 'beta' });
    expect(result.current).toBe('alpha');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('beta');
  });
});
