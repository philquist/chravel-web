import { describe, it, expect } from 'vitest';
import { isFatalAuthRefreshError } from '../sessionRefreshPolicy';

describe('isFatalAuthRefreshError', () => {
  it('treats invalid_grant as fatal', () => {
    expect(isFatalAuthRefreshError({ message: 'invalid_grant' })).toBe(true);
  });

  it('treats missing refresh token as fatal', () => {
    expect(isFatalAuthRefreshError({ message: 'Refresh token not found' })).toBe(true);
  });

  it('does not treat generic network failures as fatal', () => {
    expect(isFatalAuthRefreshError({ message: 'Failed to fetch' })).toBe(false);
    expect(
      isFatalAuthRefreshError({ message: 'NetworkError when attempting to fetch resource.' }),
    ).toBe(false);
  });

  it('does not treat ambiguous 5xx as fatal', () => {
    expect(isFatalAuthRefreshError({ message: 'upstream connect error', status: 503 })).toBe(false);
  });

  it('treats explicit 400 invalid refresh responses as fatal', () => {
    expect(
      isFatalAuthRefreshError({ message: 'Invalid Refresh Token: Already Used', status: 400 }),
    ).toBe(true);
  });
});
