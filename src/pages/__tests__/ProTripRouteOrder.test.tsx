import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';

describe('Route order for pro trips', () => {
  it('matches the canonical /tour/pro/:proTripId production URL', () => {
    expect(matchPath('/tour/pro/:proTripId', '/tour/pro/lakers-road-trip')?.params.proTripId).toBe(
      'lakers-road-trip',
    );
    expect(matchPath('/tour/pro/:proTripId', '/tour/pro-lakers-road-trip')).toBeNull();
  });
});
