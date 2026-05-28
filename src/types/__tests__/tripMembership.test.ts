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

  // Access-guard invariants (memory #21: existence of a membership row != access).
  // `accepted` is the only state that grants trip access. A member who left the
  // accepted state must NOT be able to jump straight back to `accepted` — they have
  // to be re-invited first (-> 'invited' -> 'accepted'). These guard against the
  // "existence vs membership confusion" risk by proving the state machine cannot
  // silently re-grant access.
  it('rejects removed -> accepted (removed member cannot self-restore access)', () => {
    expect(() => assertValidMembershipTransition('removed', 'accepted')).toThrow(
      /Invalid trip membership transition/,
    );
  });

  it('rejects declined -> accepted (declined invitee must be re-invited)', () => {
    expect(() => assertValidMembershipTransition('declined', 'accepted')).toThrow(
      /Invalid trip membership transition/,
    );
  });

  it('rejects archived -> accepted (archived membership must be re-invited)', () => {
    expect(() => assertValidMembershipTransition('archived', 'accepted')).toThrow(
      /Invalid trip membership transition/,
    );
  });

  it('only re-invitation restores access: removed -> invited -> accepted', () => {
    expect(() => assertValidMembershipTransition('removed', 'invited')).not.toThrow();
    expect(() => assertValidMembershipTransition('invited', 'accepted')).not.toThrow();
  });
});
