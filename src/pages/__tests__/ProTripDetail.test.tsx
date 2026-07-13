import { describe, expect, it } from 'vitest';
import { proTripMockData } from '../../data/proTripMockData';

describe('ProTripDetail', () => {
  it('has title data for every pro trip reachable by the canonical route', () => {
    for (const [id, data] of Object.entries(proTripMockData)) {
      expect(id).not.toContain('/');
      expect(data.title).toEqual(expect.any(String));
      expect(data.title.length).toBeGreaterThan(0);
    }
  });
});
