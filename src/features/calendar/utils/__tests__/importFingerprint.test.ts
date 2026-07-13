import { describe, expect, it } from 'vitest';
import {
  buildImportBatchIdempotencyKey,
  buildImportFingerprint,
  hashFingerprintSeed,
} from '@/features/calendar/utils/importFingerprint';

describe('importFingerprint', () => {
  it('prefers stable external UIDs', () => {
    expect(
      buildImportFingerprint({
        title: 'Game',
        startTime: new Date('2026-02-10T19:00:00Z'),
        externalUid: 'uid-123@calendar',
      }),
    ).toBe('uid:uid-123@calendar');
  });

  it('ignores generated imported-* UIDs and derives a fingerprint', () => {
    const fp = buildImportFingerprint({
      title: 'Pacers vs Celtics',
      startTime: new Date('2026-02-10T19:00:00Z'),
      location: 'Gainbridge Fieldhouse',
      sourceFormat: 'url',
      externalUid: 'imported-url-1',
    });
    expect(fp.startsWith('fp:')).toBe(true);
  });

  it('is stable for equivalent titles/locations with punctuation differences', () => {
    const a = buildImportFingerprint({
      title: 'Pacers vs. Celtics!',
      startTime: new Date('2026-02-10T19:00:00.000Z'),
      location: 'Gainbridge Fieldhouse',
    });
    const b = buildImportFingerprint({
      title: 'Pacers vs Celtics',
      startTime: new Date('2026-02-10T19:00:00.500Z'),
      location: 'Gainbridge Fieldhouse!!!',
    });
    expect(a).toBe(b);
  });

  it('builds repeatable batch idempotency keys', () => {
    const key1 = buildImportBatchIdempotencyKey({
      tripId: 'trip-1',
      sourceFormat: 'csv',
      eventFingerprints: ['fp:b', 'fp:a'],
    });
    const key2 = buildImportBatchIdempotencyKey({
      tripId: 'trip-1',
      sourceFormat: 'csv',
      eventFingerprints: ['fp:a', 'fp:b'],
    });
    expect(key1).toBe(key2);
    expect(key1).toContain('batch:');
  });

  it('hashFingerprintSeed is deterministic', () => {
    expect(hashFingerprintSeed('abc')).toBe(hashFingerprintSeed('abc'));
    expect(hashFingerprintSeed('abc')).not.toBe(hashFingerprintSeed('abd'));
  });
});
