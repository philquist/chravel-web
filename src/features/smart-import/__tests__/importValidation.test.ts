import { describe, expect, it } from 'vitest';
import { detectArtifactKind, validateCandidate } from '../importValidation';
import type { SmartImportCandidate } from '../types';

const candidate = (overrides: Partial<SmartImportCandidate> = {}): SmartImportCandidate => ({
  id: 'c1',
  reservation_data: {
    type: 'flight',
    departure_city: 'LAX',
    arrival_city: 'JFK',
    _relevance_score: 0.9,
  },
  ...overrides,
});

describe('importValidation', () => {
  it('flags malformed and partial parses', () => {
    const result = validateCandidate(
      candidate({ reservation_data: { type: 'flight', _relevance_score: 0.8 } }),
      'email',
      new Set(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELDS')).toBe(true);
    expect(result.errors.some(e => e.code === 'PARTIAL_PARSE')).toBe(true);
  });

  it('flags duplicates', () => {
    const seen = new Set(['c1']);
    const result = validateCandidate(candidate(), 'email', seen);
    expect(result.errors.some(e => e.code === 'DUPLICATE_CANDIDATE')).toBe(true);
  });

  it('requires manual confirm under confidence threshold', () => {
    const result = validateCandidate(
      candidate({
        reservation_data: {
          type: 'flight',
          departure_city: 'A',
          arrival_city: 'B',
          _relevance_score: 0.2,
        },
      }),
      'email',
      new Set(),
    );
    expect(result.errors.some(e => e.code === 'LOW_CONFIDENCE')).toBe(true);
  });

  it('detects artifact kind from source', () => {
    expect(detectArtifactKind('gmail')).toBe('email');
    expect(detectArtifactKind('file')).toBe('pdf');
    expect(detectArtifactKind('url')).toBe('link');
  });
});
