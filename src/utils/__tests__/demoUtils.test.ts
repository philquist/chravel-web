import { describe, expect, it } from 'vitest';
import { isDemoTrip } from '../demoUtils';

describe('isDemoTrip', () => {
  it('accepts only static numeric consumer demo trip IDs', () => {
    expect(isDemoTrip('1')).toBe(true);
    expect(isDemoTrip('12')).toBe(true);
  });

  it('rejects UUIDs and numeric IDs outside the demo catalog', () => {
    expect(isDemoTrip('00000000-0000-0000-0000-000000000001')).toBe(false);
    expect(isDemoTrip('13')).toBe(false);
    expect(isDemoTrip(undefined)).toBe(false);
  });
});
