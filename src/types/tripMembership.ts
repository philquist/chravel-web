export const TRIP_MEMBERSHIP_STATES = [
  'invited',
  'accepted',
  'declined',
  'removed',
  'archived',
] as const;

export type TripMembershipState = (typeof TRIP_MEMBERSHIP_STATES)[number];

export const TRIP_MEMBERSHIP_TRANSITIONS: Record<
  TripMembershipState,
  readonly TripMembershipState[]
> = {
  invited: ['accepted', 'declined', 'removed', 'archived'],
  accepted: ['removed', 'archived'],
  declined: ['invited', 'archived'],
  removed: ['invited', 'archived'],
  archived: ['invited'],
} as const;

export type TripMembershipAction =
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_declined'
  | 'member_removed'
  | 'membership_archived'
  | 'owner_transferred';

export interface TripMembershipAuditEvent {
  tripId: string;
  userId: string;
  actorUserId: string;
  action: TripMembershipAction;
  fromState: TripMembershipState | null;
  toState: TripMembershipState;
  metadata?: Record<string, unknown>;
}

export function assertValidMembershipTransition(
  fromState: TripMembershipState | null,
  toState: TripMembershipState,
): void {
  if (!fromState) return;

  if (!TRIP_MEMBERSHIP_TRANSITIONS[fromState].includes(toState)) {
    throw new Error(`Invalid trip membership transition: ${fromState} -> ${toState}`);
  }
}
