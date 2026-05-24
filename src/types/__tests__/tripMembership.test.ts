import { describe, expect, it } from 'vitest';
import { assertValidMembershipTransition } from '@/types/tripMembership';

describe('tripMembership state machine', () => {
  it('allows invited -> accepted (invite acceptance race path)', () => {
    expect(() => assertValidMembershipTransition('invited', 'accepted')).not.toThrow();
  });

  it('allows accepted -> removed (owner/member removal path)', () => {
    expect(() => assertValidMembershipTransition('accepted', 'removed')).not.toThrow();
  });

  it('allows removed -> archived (archival visibility path)', () => {
    expect(() => assertValidMembershipTransition('removed', 'archived')).not.toThrow();
  });

  it('rejects invalid accepted -> invited rewind', () => {
    expect(() => assertValidMembershipTransition('accepted', 'invited')).toThrow(
      /Invalid trip membership transition/,
    );
  });
});
