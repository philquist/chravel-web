import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Result of a trip-membership check.
 *
 * `error` is non-null ONLY on an infrastructure failure (the RPC itself
 * errored). A clean "user is not a member" is `{ isMember: false, error: null }`.
 * Callers use this distinction to return 500 (infra) vs 403 (not a member).
 */
export interface TripMembershipResult {
  isMember: boolean;
  error: string | null;
}

/**
 * Canonical trip-membership check for edge functions.
 *
 * Delegates to the SECURITY DEFINER `is_trip_member(_user_id uuid, _trip_id text)`
 * RPC so every caller shares one authoritative predicate instead of duplicating
 * `trip_members` selects (which drift apart and couple to the table layout).
 *
 * `userId` MUST be a JWT-verified user id — verifying the caller's identity is
 * the caller's responsibility; this helper only answers "does that verified
 * user belong to this trip?". Pass a service-role client so the check is robust
 * to RLS-policy drift on `trip_members`.
 */
export async function verifyTripMembership(
  adminClient: SupabaseClient,
  userId: string,
  tripId: string,
): Promise<TripMembershipResult> {
  const { data, error } = await adminClient.rpc('is_trip_member', {
    _user_id: userId,
    _trip_id: tripId,
  });

  if (error) {
    return { isMember: false, error: error.message };
  }

  return { isMember: data === true, error: null };
}
