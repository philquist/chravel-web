/** Mirrors PRO_LIMITS.memberLimit in src/utils/featureTiers.ts and SQL get_trip_member_limit. */
export const PRO_PLAN_MEMBER_LIMITS = {
  'pro-starter': 50,
  'pro-growth': 100,
  'pro-enterprise': 250,
} as const;

export type ProPlanSlug = keyof typeof PRO_PLAN_MEMBER_LIMITS;

export const CONSUMER_EVENT_ATTENDEE_LIMITS = {
  free: 50,
  explorer: 100,
  'frequent-chraveler': 200,
} as const;

export const DEFAULT_PRO_TRIP_MEMBER_LIMIT = 50;

export const PAGINATED_ROSTER_THRESHOLD = 50;
export const ROSTER_PAGE_SIZE = 50;

export function getProPlanMemberLimit(plan: string | null | undefined): number | null {
  if (!plan) return null;
  return PRO_PLAN_MEMBER_LIMITS[plan as ProPlanSlug] ?? null;
}

/** True when adding another member would meet or exceed the cap. */
export function isTripAtMemberCapacity(memberCount: number, memberLimit: number | null): boolean {
  if (memberLimit === null || memberLimit < 0) return false;
  return memberCount >= memberLimit;
}
