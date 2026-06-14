import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimiter } from '../concurrencyUtils';

describe('concurrencyUtils', () => {
  describe('RateLimiter', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow requests within limit', () => {
      const key = 'test-key-1';
      expect(rateLimiter.checkLimit(key, 3, 1000)).toBe(true);
      expect(rateLimiter.getRemainingAttempts(key, 3)).toBe(2);

      expect(rateLimiter.checkLimit(key, 3, 1000)).toBe(true);
      expect(rateLimiter.getRemainingAttempts(key, 3)).toBe(1);

      expect(rateLimiter.checkLimit(key, 3, 1000)).toBe(true);
      expect(rateLimiter.getRemainingAttempts(key, 3)).toBe(0);
    });

    it('should block requests over limit', () => {
      const key = 'test-key-2';
      expect(rateLimiter.checkLimit(key, 2, 1000)).toBe(true);
      expect(rateLimiter.checkLimit(key, 2, 1000)).toBe(true);

      expect(rateLimiter.checkLimit(key, 2, 1000)).toBe(false);
      expect(rateLimiter.getRemainingAttempts(key, 2)).toBe(0);
    });

    it('should reset after window expires', () => {
      const key = 'test-key-3';
      const windowMs = 1000;

      expect(rateLimiter.checkLimit(key, 1, windowMs)).toBe(true);
      expect(rateLimiter.checkLimit(key, 1, windowMs)).toBe(false);

      vi.advanceTimersByTime(windowMs + 1);

      expect(rateLimiter.checkLimit(key, 1, windowMs)).toBe(true);
      expect(rateLimiter.getRemainingAttempts(key, 1)).toBe(0);
    });

    it('should track keys independently', () => {
      const key1 = 'test-key-4';
      const key2 = 'test-key-5';

      expect(rateLimiter.checkLimit(key1, 1, 1000)).toBe(true);
      expect(rateLimiter.checkLimit(key1, 1, 1000)).toBe(false);

      expect(rateLimiter.checkLimit(key2, 1, 1000)).toBe(true);
      expect(rateLimiter.getRemainingAttempts(key2, 1)).toBe(0);
      expect(rateLimiter.getRemainingAttempts(key1, 1)).toBe(0);
    });
  });
});
