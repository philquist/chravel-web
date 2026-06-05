import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/safeReload', () => ({
  safeReload: vi.fn().mockResolvedValue(undefined),
}));

import { safeReload } from '@/utils/safeReload';
import {
  isChunkLoadError,
  claimOneShotReload,
  recoverFromChunkError,
  markAppBooted,
} from '../chunkRecovery';

describe('chunkRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Reset the module-level in-flight guard between tests.
    markAppBooted();
  });

  describe('isChunkLoadError', () => {
    it('matches post-deploy stale-chunk / module-load failures', () => {
      const messages = [
        'Failed to fetch dynamically imported module /assets/js/App-abc.js',
        'error loading dynamically imported module',
        'Loading chunk 42 failed',
        'ChunkLoadError: Loading chunk 7 failed',
        'Loading CSS chunk 3 failed',
        'Importing a module script failed',
        'Failed to load module script',
      ];
      for (const m of messages) {
        expect(isChunkLoadError(new Error(m))).toBe(true);
        expect(isChunkLoadError(m)).toBe(true);
      }
    });

    it('ignores unrelated errors and nullish values', () => {
      expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
      expect(isChunkLoadError('some random failure')).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });

    it('reads the message off a rejection reason object', () => {
      expect(isChunkLoadError({ message: 'Loading chunk 9 failed' })).toBe(true);
    });
  });

  describe('claimOneShotReload', () => {
    it('returns true only the first time per key, false afterwards', () => {
      expect(claimOneShotReload('k1')).toBe(true);
      expect(claimOneShotReload('k1')).toBe(false);
      expect(claimOneShotReload('k1')).toBe(false);
    });

    it('tracks keys independently', () => {
      expect(claimOneShotReload('a')).toBe(true);
      expect(claimOneShotReload('b')).toBe(true);
      expect(claimOneShotReload('a')).toBe(false);
    });
  });

  describe('recoverFromChunkError', () => {
    it('clears caches + reloads once, then refuses until the app re-boots', async () => {
      const first = await recoverFromChunkError();
      expect(first).toBe(true);
      expect(safeReload).toHaveBeenCalledWith(true);
      expect(safeReload).toHaveBeenCalledTimes(1);

      // Second call this "session" must not reload again (prevents a reload loop).
      const second = await recoverFromChunkError();
      expect(second).toBe(false);
      expect(safeReload).toHaveBeenCalledTimes(1);

      // After a successful boot, an independent later failure can recover again.
      markAppBooted();
      const third = await recoverFromChunkError();
      expect(third).toBe(true);
      expect(safeReload).toHaveBeenCalledTimes(2);
    });
  });
});
