import { describe, it, expect } from 'vitest';
import { toStableTripId } from '@/utils/tripId';

describe('toStableTripId', () => {
  const UUID = '22be43ef-270d-4c99-9b53-b3541d5c82ef';

  it('keeps a UUID trip id intact (regression: parseInt(uuid) corrupted it)', () => {
    // The bug this guards: `parseInt(UUID) || 0` never yields the real id — for this UUID
    // it reads the leading digits ("22"), for a letter-leading UUID it yields 0. Either
    // way the Trip Details drawer then queried the wrong trip and rendered "0 members" /
    // broke cover upload.
    expect(String(parseInt(UUID, 10) || 0)).not.toBe(UUID); // old coercion corrupts it
    expect(String(parseInt('abc00000-0000-0000-0000-000000000000', 10) || 0)).toBe('0');
    expect(toStableTripId(UUID)).toBe(UUID); // the fix preserves the real id
  });

  it('stringifies a genuinely numeric id', () => {
    expect(toStableTripId(42)).toBe('42');
  });

  it('returns empty string for null/undefined instead of a bogus 0', () => {
    expect(toStableTripId(null)).toBe('');
    expect(toStableTripId(undefined)).toBe('');
  });
});
