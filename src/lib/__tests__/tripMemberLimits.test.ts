import { describe, expect, it } from 'vitest';
import {
  getProPlanMemberLimit,
  isTripAtMemberCapacity,
  PRO_PLAN_MEMBER_LIMITS,
} from '../tripMemberLimits';

describe('tripMemberLimits', () => {
  const growthLimit = PRO_PLAN_MEMBER_LIMITS['pro-growth'];

  it('maps pro-growth to 100 members', () => {
    expect(getProPlanMemberLimit('pro-growth')).toBe(100);
  });

  it('treats 99 members as below a 100-member cap', () => {
    expect(isTripAtMemberCapacity(99, growthLimit)).toBe(false);
  });

  it('treats 100 members as at capacity for a 100-member cap', () => {
    expect(isTripAtMemberCapacity(100, growthLimit)).toBe(true);
  });

  it('treats 101 members as over capacity for a 100-member cap', () => {
    expect(isTripAtMemberCapacity(101, growthLimit)).toBe(true);
  });

  it('never blocks when limit is null (consumer trips)', () => {
    expect(isTripAtMemberCapacity(500, null)).toBe(false);
  });
});
