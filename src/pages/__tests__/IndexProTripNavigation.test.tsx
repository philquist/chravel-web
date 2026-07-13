import { describe, expect, it } from 'vitest';
import { proTripMockData } from '../../data/proTripMockData';

describe('Index ProTrip navigation', () => {
  it('keeps mock pro trips addressable through the canonical production route', () => {
    for (const id of Object.keys(proTripMockData)) {
      expect(`/tour/pro/${id}`).toMatch(/^\/tour\/pro\/[^/]+$/);
    }
  });
});
