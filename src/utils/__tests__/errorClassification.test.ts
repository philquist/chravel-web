import { describe, it, expect } from 'vitest';
import { classifyError } from '../errorClassification';

describe('classifyError', () => {
  it('classifies RLS / permission errors (code, status, and message variants)', () => {
    expect(classifyError({ code: '42501', message: 'new row violates row-level security' })).toBe(
      'permission-denied',
    );
    expect(classifyError({ code: '42000' })).toBe('permission-denied');
    expect(classifyError({ status: 403 })).toBe('permission-denied');
    expect(classifyError({ message: 'permission denied for table channel_messages' })).toBe(
      'permission-denied',
    );
  });

  it('classifies foreign-key and validation constraint errors distinctly', () => {
    expect(classifyError({ code: '23503', message: 'violates foreign key constraint' })).toBe(
      'foreign-key',
    );
    expect(classifyError({ code: '23502', message: 'null value in column "content"' })).toBe(
      'validation',
    );
  });

  it('classifies not-found via PGRST116 / 404 / message', () => {
    expect(classifyError({ code: 'PGRST116' })).toBe('not-found');
    expect(classifyError({ status: 404 })).toBe('not-found');
    expect(classifyError({ message: 'no rows returned' })).toBe('not-found');
  });

  it('separates rate-limit (429) from network', () => {
    expect(classifyError({ status: 429, message: 'Too Many Requests' })).toBe('rate-limit');
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyError({ message: 'Request timeout' })).toBe('network');
    expect(classifyError({ status: 503 })).toBe('network');
  });

  it('classifies auth-required and malformed message variants', () => {
    expect(classifyError({ message: 'AUTH_REQUIRED' })).toBe('auth-required');
    expect(classifyError({ message: 'Unexpected token < in JSON' })).toBe('malformed');
  });

  it('falls back to unknown for unrecognized, string, and nullish errors', () => {
    expect(classifyError({ code: 'WEIRD', message: 'something odd' })).toBe('unknown');
    expect(classifyError('some string error')).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });
});
