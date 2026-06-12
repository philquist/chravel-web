import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { bufferBootError, drainBootErrors } from '../bootErrorBuffer';

const STORAGE_KEY = 'chravel_boot_errors';

describe('bootErrorBuffer', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Drain any in-memory fallback entries left by a prior test
    drainBootErrors();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists buffered errors to sessionStorage and drains them once', () => {
    const error = new Error('boom');
    bufferBootError(error, { context: 'unhandledrejection' });

    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    const drained = drainBootErrors();
    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('boom');
    expect(drained[0].name).toBe('Error');
    expect(drained[0].context).toEqual({ context: 'unhandledrejection' });

    // Drained means gone — a second drain returns nothing
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(drainBootErrors()).toHaveLength(0);
  });

  it('returns entries persisted by a previous boot (survives reload)', () => {
    // Simulate a prior crashed boot that wrote directly to sessionStorage
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ name: 'ChunkLoadError', message: 'stale chunk', ts: 123 }]),
    );

    const drained = drainBootErrors();
    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('stale chunk');
  });

  it('caps the ring buffer at 10 entries, keeping the newest', () => {
    for (let i = 0; i < 15; i += 1) {
      bufferBootError(new Error(`err-${i}`));
    }

    const drained = drainBootErrors();
    expect(drained).toHaveLength(10);
    expect(drained[0].message).toBe('err-5');
    expect(drained[9].message).toBe('err-14');
  });

  it('falls back to in-memory buffering when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    bufferBootError(new Error('restricted'));

    const drained = drainBootErrors();
    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('restricted');
  });

  it('survives corrupted persisted JSON without throwing', () => {
    sessionStorage.setItem(STORAGE_KEY, '{not-json');
    bufferBootError(new Error('after-corruption'));

    const drained = drainBootErrors();
    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('after-corruption');
  });
});
