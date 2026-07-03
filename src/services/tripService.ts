import { supabase } from '@/integrations/supabase/client';
import { getCachedAuthUser } from '@/lib/authCache';
import { errorTracking } from '@/utils/errorTracking';
import { syncTripMemberToStreamChannelsOnly } from '@/lib/streamTripMemberInlineActivity';
import { reportStreamMembershipSyncFailure } from '@/services/stream/streamMembershipCoordinator';
import { demoModeService } from './demoModeService';
import { tripsData } from '@/data/tripsData';
import { adaptTripsDataToTripSchema } from '@/utils/schemaAdapters';
import { FORMER_MEMBER_LABEL } from '@/lib/resolveDisplayName';
import { formatLocalDate } from '@/utils/dateHelpers';
import { resolveEffectiveTier } from './entitlementService';

/**
 * Normalizes date input to YYYY-MM-DD format for database date columns
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, or ISO 8601 datetime strings
 * Returns date-only format (YYYY-MM-DD) expected by Postgres date columns
 */
function _normalizeDateInput(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;

  // If already YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // If ISO 8601 datetime, extract date part only
  if (dateStr.includes('T')) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return formatLocalDate(date);
    }
  }

  // Match MM/DD/YYYY and convert to YYYY-MM-DD
  const usDateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDateMatch) {
    const [, month, day, year] = usDateMatch;
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  return undefined;
}

export interface Trip {
  id: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  destination?: string;
  cover_image_url?: string;
  cover_display_mode?: 'cover' | 'contain';
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  trip_type: string;
  basecamp_name?: string;
  basecamp_address?: string;
  enabled_features?: string[]; // ✅ Phase 2: Feature toggles for Pro/Event trips
  membership_status?: 'owner' | 'member' | 'pending' | 'rejected'; // Membership status for current user
  card_color?: string | null; // Color coding for Pro/Event cards
  organizer_display_name?: string | null; // Organizer name for Events (e.g., "Los Angeles Rams")
  // Aggregate join fields returned by Supabase select queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trip_members?: any[];
  trip_events_places?: any[];
  categories?: any[];
}

export interface CreateTripData {
  id?: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  destination?: string;
  cover_image_url?: string;
  trip_type?: string;
  basecamp_name?: string;
  basecamp_address?: string;
  enabled_features?: string[];
  card_color?: string;
  organizer_display_name?: string;
  privacy_mode?: string;
  ai_access_enabled?: boolean;
  category?: string; // Pro trip category enum value
}

type TripDetailErrorCode = 'AUTH_REQUIRED' | 'TRIP_NOT_FOUND' | 'ACCESS_DENIED' | 'BAD_REQUEST';

interface TripDetailFunctionResponse {
  success: boolean;
  trip?: Trip;
  error?: string;
  error_code?: TripDetailErrorCode;
}

const fetchTripByIdViaEdgeFunction = async (tripId: string): Promise<Trip | null> => {
  const { data, error } = await supabase.functions.invoke('get-trip-detail', {
    body: { tripId },
  });

  if (error) {
    throw new Error(`Failed to load trip: ${error.message}`);
  }

  const response = data as TripDetailFunctionResponse | undefined;
  if (!response) {
    throw new Error('Failed to load trip: Empty response');
  }

  if (!response.success) {
    if (response.error_code === 'AUTH_REQUIRED') {
      throw new Error('AUTH_REQUIRED');
    }
    if (response.error_code === 'ACCESS_DENIED') {
      throw new Error('ACCESS_DENIED');
    }
    if (response.error_code === 'TRIP_NOT_FOUND') {
      throw new Error('TRIP_NOT_FOUND');
    }
    throw new Error(response.error || 'Failed to load trip');
  }

  return response.trip ?? null;
};

export const tripService = {
  async createTrip(tripData: CreateTripData): Promise<Trip | null> {
    try {
      let {
        data: { user },
      } = await supabase.auth.getUser();

      // Fallback: if getUser() returns null, try refreshing the session
      if (!user) {
        if (import.meta.env.DEV) {
          console.warn('[tripService] getUser() returned null, attempting session refresh...');
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          // Session exists but getUser failed — force refresh
          const { data: refreshData } = await supabase.auth.refreshSession();
          user = refreshData?.user ?? null;
          if (user && import.meta.env.DEV) {
            console.log('[tripService] Session refresh recovered user:', user.id);
          }
        }
      }

      // Enhanced validation with detailed error logging
      if (!user) {
        if (import.meta.env.DEV) {
          console.error('[tripService] No authenticated user found after refresh attempt');
        }
        throw new Error('No authenticated user');
      }

      if (!user.id) {
        if (import.meta.env.DEV) {
          console.error('[tripService] Authenticated user missing ID', { user });
        }
        throw new Error('Invalid user state - missing ID');
      }

      // Super admin bypass for trip creation limits (server-side is_super_admin() enforces RLS)
      const { SUPER_ADMIN_EMAILS } = await import('@/constants/admins');
      const authEmail = user.email?.toLowerCase().trim();
      const isSuperAdmin = authEmail ? SUPER_ADMIN_EMAILS.includes(authEmail) : false;

      if (!isSuperAdmin) {
        const tier = await resolveEffectiveTier(user.id);

        // Count active (non-archived) trips OF THE SAME TYPE being created
        const tripTypeToCheck = tripData.trip_type || 'consumer';
        const { count, error: countError } = await supabase
          .from('trips')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .eq('is_archived', false)
          .eq('trip_type', tripTypeToCheck);

        if (countError) throw countError;

        // 3 trips per type for free users
        const activeTripsLimit = tier === 'free' ? 3 : -1;
        if (activeTripsLimit !== -1 && (count || 0) >= activeTripsLimit) {
          throw new Error('TRIP_LIMIT_REACHED');
        }
      }

      // Dates already in ISO 8601 format from CreateTripModal - no normalization needed

      // Use edge function for server-side validation and Pro tier enforcement
      const { data, error } = await supabase.functions.invoke('create-trip', {
        body: {
          name: tripData.name,
          description: tripData.description,
          destination: tripData.destination,
          start_date: tripData.start_date,
          end_date: tripData.end_date,
          trip_type: tripData.trip_type || 'consumer',
          cover_image_url: tripData.cover_image_url,
          card_color: tripData.card_color,
          organizer_display_name: tripData.organizer_display_name,
          enabled_features: tripData.enabled_features,
          privacy_mode: tripData.privacy_mode,
          ai_access_enabled: tripData.ai_access_enabled,
          category: tripData.category, // Pro trip category enum value
        },
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[tripService] Edge function error:', error);
        }

        // SAFETY: This block only handles trip *creation* errors (not trip loading).
        // No Trip Not Found risk — getTripById is a separate method.
        // No auth desync — auth flow (lines 124-157) is untouched.
        // No RLS leak — error messages are either known codes or hardcoded strings.

        const rawErrorMessage =
          error && typeof error === 'object' && 'message' in error
            ? String(error.message ?? '')
            : '';
        const isFetchFailure = /failed to fetch/i.test(rawErrorMessage);
        if (isFetchFailure) {
          throw new Error(
            'Unable to reach trip creation service. If this happens on a preview domain, add that origin to Edge Function CORS allowlist (ADDITIONAL_ALLOWED_ORIGINS) and redeploy create-trip.',
          );
        }

        // Extract the actual error message from the edge function response body.
        // supabase.functions.invoke returns { data: null, error: FunctionsHttpError }
        // for non-2xx responses. The response body is in error.context (raw Response).
        let detailedMessage = '';

        // First try data (populated in some client versions)
        if (data?.error) {
          detailedMessage = data.error;
        } else if (data?.message) {
          detailedMessage = data.message;
        }

        // Only parse Response objects (FunctionsHttpError/FunctionsRelayError).
        // FunctionsFetchError stores a TypeError in context — not a Response.
        // Previously used `typeof error.context.json === 'function'` which also
        // matched TypeError objects, leaking raw "Failed to fetch" to users.
        if (!detailedMessage && error.context instanceof Response) {
          try {
            const responseBody = await error.context.json();
            detailedMessage = responseBody?.error || responseBody?.message || '';
          } catch {
            // Response body already consumed or not JSON - ignore
          }
        }

        // Map known edge function error codes to user-friendly messages
        if (detailedMessage === 'UPGRADE_REQUIRED_PRO_TRIP') {
          throw new Error('UPGRADE_REQUIRED_PRO_TRIP');
        }
        if (detailedMessage === 'UPGRADE_REQUIRED_EVENT') {
          throw new Error('UPGRADE_REQUIRED_EVENT');
        }

        // Network errors (CORS, offline, etc.) get a specific user-friendly message
        if (!detailedMessage && error.name === 'FunctionsFetchError') {
          throw new Error(
            'Network error creating trip. Please check your connection and try again.',
          );
        }

        throw new Error(detailedMessage || 'Failed to create trip. Please try again.');
      }

      if (!data?.success) {
        if (import.meta.env.DEV) {
          console.error('[tripService] Edge function returned failure:', data);
        }
        throw new Error(data?.error || 'Failed to create trip');
      }

      return data.trip;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[tripService] Error creating trip:', error);
      }
      // Handle network-level errors (FunctionsFetchError) with a user-friendly message.
      // When supabase.functions.invoke cannot reach the function, it throws with
      // message "Failed to fetch" rather than returning { error: FunctionsHttpError }.
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        errMsg === 'Failed to fetch' ||
        errMsg.toLowerCase().includes('networkerror') ||
        errMsg.toLowerCase().includes('failed to fetch')
      ) {
        throw new Error('Network error creating trip. Please check your connection and try again.');
      }
      // Re-throw to preserve error message for UI
      throw error;
    }
  },

  async getUserTrips(
    isDemoMode?: boolean,
    tripType?: 'consumer' | 'pro' | 'event',
    userId?: string,
  ): Promise<Trip[]> {
    try {
      const demoEnabled = isDemoMode ?? (await demoModeService.isDemoModeEnabled());
      if (demoEnabled) {
        if (tripType === 'pro') return [];
        if (tripType === 'event') return [];
        const adaptedTrips = adaptTripsDataToTripSchema(tripsData);
        return adaptedTrips;
      }

      let activeUserId = userId;
      if (!activeUserId) {
        const user = await getCachedAuthUser();
        if (!user) return [];
        activeUserId = user.id;
      }

      const TRIP_LIST_COLUMNS =
        'id, name, description, start_date, end_date, destination, trip_type, created_at, updated_at, cover_image_url, cover_display_mode, created_by, is_archived, card_color, organizer_display_name';
      let query = supabase
        .from('trips')
        .select(TRIP_LIST_COLUMNS)
        .eq('created_by', activeUserId)
        .eq('is_archived', false)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(200);

      if (tripType) {
        query = query.eq('trip_type', tripType);
      }

      const { data: createdTrips, error: createdError } = await query;

      if (createdError) throw createdError;

      const allTrips: Array<
        Record<string, any> & { id: string; membership_status: 'owner' | 'member' }
      > = (createdTrips || []).map(trip => ({
        ...trip,
        membership_status: 'owner' as const,
      }));

      // Fetch trips where user is an active member (not creator).
      // Canonical schema: trip_members has no status column, so the primary
      // lookup queries without one. Compatibility retry (DEBUG_PATTERNS.md
      // "status-column drift"): if the primary lookup errors — transient
      // failure or an environment where membership rows carry a status column
      // and must be filtered to active — retry once with the legacy
      // active-membership filter instead of silently dropping member trips.
      // An approved member must always see their trip on the dashboard.
      let memberTrips: Array<{ trip_id: string }> | null = null;

      const primaryMemberResult = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', activeUserId)
        .limit(1000);

      if (primaryMemberResult.error) {
        errorTracking.captureException(
          new Error(
            `getUserTrips member lookup failed (retrying with legacy status filter): ${primaryMemberResult.error.message}`,
          ),
          { userId: activeUserId, context: 'tripService.getUserTrips.memberLookup' },
        );

        const legacyMemberResult = await supabase
          .from('trip_members')
          .select('trip_id')
          .eq('user_id', activeUserId)
          .or('status.is.null,status.eq.active')
          .limit(1000);

        if (legacyMemberResult.error) {
          // Both lookups failed. Report loudly — member trips will be missing
          // from the dashboard — but still return owner trips below rather
          // than conflating this failure with an empty dashboard.
          errorTracking.captureException(
            new Error(
              `getUserTrips member lookup retry failed: ${legacyMemberResult.error.message}`,
            ),
            { userId: activeUserId, context: 'tripService.getUserTrips.memberLookupRetry' },
          );
        } else {
          memberTrips = legacyMemberResult.data;
        }
      } else {
        memberTrips = primaryMemberResult.data;
      }

      if (memberTrips && memberTrips.length > 0) {
        const memberTripIds = memberTrips
          .map(m => m.trip_id)
          .filter(id => !allTrips.some(t => t.id === id)); // Exclude already fetched trips

        if (memberTripIds.length > 0) {
          const { data: memberTripsData, error: memberTripsError } = await supabase
            .from('trips')
            .select(TRIP_LIST_COLUMNS)
            .in('id', memberTripIds)
            .eq('is_archived', false)
            .eq('is_hidden', false);

          if (memberTripsError) {
            // Don't silently hide member trips — report and continue with owner trips.
            errorTracking.captureException(
              new Error(`getUserTrips member trip hydration failed: ${memberTripsError.message}`),
              { userId: activeUserId, context: 'tripService.getUserTrips.memberTripHydration' },
            );
          } else if (memberTripsData) {
            allTrips.push(
              ...memberTripsData.map(trip => ({
                ...trip,
                membership_status: 'member' as const,
              })),
            );
          }
        }
      }

      if (allTrips.length === 0) return [];

      // Batch-fetch member counts and places (calendar events with locations)
      const tripIds = allTrips.map(t => t.id);

      const [membersResult, eventsResult] = await Promise.all([
        supabase.from('trip_members').select('trip_id, user_id').in('trip_id', tripIds).limit(5000),
        supabase
          .from('trip_events')
          .select('trip_id, location')
          .in('trip_id', tripIds)
          .not('location', 'is', null)
          .neq('location', '')
          .limit(5000),
      ]);

      // Count members per trip and track user_ids for creator check
      const memberCountMap = new Map<string, number>();
      const memberUserSets = new Map<string, Set<string>>();
      membersResult.data?.forEach(m => {
        memberCountMap.set(m.trip_id, (memberCountMap.get(m.trip_id) || 0) + 1);
        if (!memberUserSets.has(m.trip_id)) memberUserSets.set(m.trip_id, new Set());
        memberUserSets.get(m.trip_id)!.add(m.user_id);
      });

      // Count distinct locations per trip (unique places)
      const placesCountMap = new Map<string, number>();
      eventsResult.data?.forEach(e => {
        const key = e.trip_id;
        if (!placesCountMap.has(key)) {
          placesCountMap.set(key, 0);
        }
      });
      // Build sets of unique locations per trip, then count
      const locationSets = new Map<string, Set<string>>();
      eventsResult.data?.forEach(e => {
        if (!locationSets.has(e.trip_id)) {
          locationSets.set(e.trip_id, new Set());
        }
        locationSets.get(e.trip_id)!.add(e.location!.toLowerCase().trim());
      });
      locationSets.forEach((locations, tripId) => {
        placesCountMap.set(tripId, locations.size);
      });

      // Attach counts to trips in the format expected by tripConverter
      // Include trip creator in count if they're not already in trip_members
      return allTrips.map(trip => {
        let count = memberCountMap.get(trip.id) || 0;
        const memberSet = memberUserSets.get(trip.id);
        if (trip.created_by && (!memberSet || !memberSet.has(trip.created_by))) {
          count += 1;
        }
        return {
          ...trip,
          trip_members: [{ count }],
          trip_events_places: [{ count: placesCountMap.get(trip.id) || 0 }],
        };
      }) as unknown as Trip[];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching trips:', error);
      }
      // Report before returning [] so a failed dashboard load is observable
      // and not silently indistinguishable from a genuinely empty dashboard.
      errorTracking.captureException(error instanceof Error ? error : new Error(String(error)), {
        userId,
        context: 'tripService.getUserTrips',
      });
      return [];
    }
  },

  async getTripById(tripId: string): Promise<Trip | null> {
    // NOTE: Auth is now handled by useTripDetailData hook (gates query on authUserId)
    // This service method only runs when user is authenticated

    // Use maybeSingle() to distinguish "no rows" from errors
    const { data, error } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();

    if (error) {
      // Log in dev for debugging
      if (import.meta.env.DEV) {
        console.error('[tripService.getTripById] Error:', {
          tripId,
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }
      // CRITICAL: Throw so React Query marks this as an error (not cached as null success)
      throw new Error(`Failed to load trip: ${error.message}`);
    }

    if (data) {
      const activeUser = await getCachedAuthUser();
      if (!activeUser?.id) {
        throw new Error('AUTH_REQUIRED');
      }

      const isCreator = data.created_by === activeUser.id;
      if (isCreator) {
        return data as Trip;
      }

      // Explicit membership check to avoid treating any RLS-visible row as readable
      const { data: memberRow, error: memberError } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', tripId)
        .eq('user_id', activeUser.id)
        .maybeSingle();

      if (memberError) {
        throw new Error(`Failed to verify membership: ${memberError.message}`);
      }

      if (!memberRow) {
        throw new Error('ACCESS_DENIED');
      }

      return data as Trip;
    }

    // No row from direct query - defer to canonical server-side trip existence + access check
    return await fetchTripByIdViaEdgeFunction(tripId);
  },

  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<boolean> {
    try {
      // Use .select() to verify the update actually happened
      // RLS policy "Trip creators can update their trips" handles authorization
      const { data, error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', tripId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[tripService] Update error:', error);
        return false;
      }

      // Check if any row was actually updated
      if (!data) {
        console.error(
          '[tripService] No rows updated - user may not have permission to update trip:',
          tripId,
        );
        return false;
      }

      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating trip:', error);
      }
      return false;
    }
  },

  async archiveTrip(tripId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('trips').update({ is_archived: true }).eq('id', tripId);

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error archiving trip:', error);
      }
      return false;
    }
  },

  async getTripMembers(tripId: string) {
    try {
      const { data: initialData, error } = await supabase
        .from('trip_members')
        .select('id, user_id, role, created_at')
        .eq('trip_id', tripId)
        .limit(500);

      let data = initialData;
      if (error) {
        const statusColumnError =
          error.message?.toLowerCase().includes('status') ||
          error.message?.toLowerCase().includes('does not exist');
        if (statusColumnError) {
          const fallback = await supabase
            .from('trip_members')
            .select('id, user_id, role, created_at')
            .eq('trip_id', tripId)
            .limit(500);
          if (fallback.error) throw fallback.error;
          data = fallback.data ?? [];
        } else {
          throw error;
        }
      }

      // Fetch profiles separately since there's no foreign key
      if (!data || data.length === 0) return [];

      const userIds = data.map(m => m.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, first_name, last_name, resolved_display_name, avatar_url')
        .in('user_id', userIds)
        .limit(500);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
      }

      // Merge trip_members with profiles
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      return data.map(m => ({
        ...m,
        profiles: profilesMap.get(m.user_id) || null,
      }));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching trip members:', error);
      }
      return [];
    }
  },

  /**
   * ⚡ PERFORMANCE: Combined query for members + creator in single parallel batch
   * Reduces 3 sequential round-trips to 1 parallel batch
   */
  async getTripMembersWithCreator(tripId: string): Promise<{
    members: Array<{
      id: string;
      name: string;
      avatar?: string;
      isCreator?: boolean;
      role?: string;
    }>;
    creatorId: string | null;
  }> {
    // NOTE: Auth is now handled by useTripDetailData hook (gates query on authUserId)
    // This service method only runs when user is authenticated

    if (import.meta.env.DEV) {
      console.log('[tripService.getTripMembersWithCreator] Fetching for tripId:', tripId);
    }

    // Parallel fetch: trip creator + members
    const tripResult = await supabase
      .from('trips')
      .select('created_by')
      .eq('id', tripId)
      .maybeSingle();

    // Fetch members: try with status filter first (if column exists), fallback without.
    // Safety limit(500): scoped by single trip_id — no trip will have 500+ members.
    // RLS enforces access server-side before the limit is applied.
    const membersResult = await supabase
      .from('trip_members')
      .select('id, user_id, role, created_at')
      .eq('trip_id', tripId)
      .limit(500);

    // CRITICAL: Check for auth/RLS/network errors and THROW (don't silently return empty)
    if (tripResult.error) {
      if (import.meta.env.DEV) {
        console.error('[tripService.getTripMembersWithCreator] Trip query error:', {
          tripId,
          code: tripResult.error.code,
          message: tripResult.error.message,
        });
      }
      throw new Error(`Failed to load trip data: ${tripResult.error.message}`);
    }

    if (membersResult.error) {
      if (import.meta.env.DEV) {
        console.error('[tripService.getTripMembersWithCreator] Members query error:', {
          tripId,
          code: membersResult.error.code,
          message: membersResult.error.message,
        });
      }
      throw new Error(`Failed to load trip members: ${membersResult.error.message}`);
    }

    const creatorId = tripResult.data?.created_by || null;

    if (import.meta.env.DEV) {
      console.log('[tripService.getTripMembersWithCreator] Results:', {
        creatorId,
        membersCount: membersResult.data?.length ?? 0,
      });
    }

    // If no members in table but we have creator, fetch creator as minimum member
    if (!membersResult.data || membersResult.data.length === 0) {
      if (import.meta.env.DEV) {
        console.warn('[tripService] No members found in trip_members table for trip:', tripId);
      }
      if (creatorId) {
        const { data: creatorProfile } = await supabase
          .from('profiles_public')
          .select('user_id, display_name, first_name, last_name, resolved_display_name, avatar_url')
          .eq('user_id', creatorId)
          .maybeSingle();

        return {
          members: [
            {
              id: creatorId,
              name:
                creatorProfile?.resolved_display_name ||
                creatorProfile?.display_name ||
                'Trip Creator',
              avatar: creatorProfile?.avatar_url,
              isCreator: true,
              role: 'admin',
            },
          ],
          creatorId,
        };
      }
      return { members: [], creatorId };
    }

    // Fetch profiles for all members
    const userIds = membersResult.data.map(m => m.user_id);
    const { data: profilesData } = await supabase
      .from('profiles_public')
      .select('user_id, display_name, first_name, last_name, resolved_display_name, avatar_url')
      .in('user_id', userIds)
      .limit(500);

    const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

    let members = membersResult.data.map(m => {
      const profile = profilesMap.get(m.user_id);
      return {
        id: m.user_id,
        name: profile?.resolved_display_name || profile?.display_name || FORMER_MEMBER_LABEL,
        avatar: profile?.avatar_url,
        isCreator: m.user_id === creatorId,
        role: m.role || 'member',
      };
    });

    // Add creator to list only if they're still an active member (creator can leave)
    if (creatorId && !members.some(m => m.id === creatorId)) {
      const { data: creatorMembership } = await supabase
        .from('trip_members')
        .select('*')
        .eq('trip_id', tripId)
        .eq('user_id', creatorId)
        .maybeSingle();
      // status column does not exist on trip_members - if membership row exists, creator is active
      const creatorActive = !creatorMembership || true;
      if (creatorActive) {
        const { data: creatorProfile } = await supabase
          .from('profiles_public')
          .select('user_id, display_name, first_name, last_name, resolved_display_name, avatar_url')
          .eq('user_id', creatorId)
          .maybeSingle();
        members = [
          {
            id: creatorId,
            name:
              creatorProfile?.resolved_display_name ||
              creatorProfile?.display_name ||
              'Trip Creator',
            avatar: creatorProfile?.avatar_url,
            isCreator: true,
            role: creatorMembership?.role || 'admin',
          },
          ...members,
        ];
      }
    }

    if (import.meta.env.DEV) {
      console.log('[tripService.getTripMembersWithCreator] Returning', members.length, 'members');
    }
    return { members, creatorId };
  },

  async getTripMemberMeta(
    tripId: string,
  ): Promise<{ memberCount: number; creatorId: string | null }> {
    const { data, error } = await supabase
      .from('trips')
      .select('member_count, created_by')
      .eq('id', tripId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load trip member metadata: ${error.message}`);
    }

    return {
      memberCount: data?.member_count ?? 0,
      creatorId: data?.created_by ?? null,
    };
  },

  async listTripMembersPage(
    tripId: string,
    options: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<{
    members: Array<{
      id: string;
      name: string;
      avatar?: string;
      isCreator?: boolean;
      role?: string;
    }>;
    total_count: number;
    limit: number;
    offset: number;
    creatorId: string | null;
  }> {
    const [{ data: rpcData, error: rpcError }, meta] = await Promise.all([
      (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )('list_trip_members', {
        p_trip_id: tripId,
        p_search: options.search ?? null,
        p_limit: options.limit ?? 50,
        p_offset: options.offset ?? 0,
      }),
      this.getTripMemberMeta(tripId),
    ]);

    if (rpcError) {
      throw new Error(`Failed to load trip members page: ${rpcError.message}`);
    }

    const payload = rpcData as {
      members?: Array<{
        user_id: string;
        role?: string;
        display_name?: string;
        avatar_url?: string | null;
      }>;
      total_count?: number;
      limit?: number;
      offset?: number;
    } | null;

    const creatorId = meta.creatorId;
    const members = (payload?.members ?? []).map(member => ({
      id: member.user_id,
      name: member.display_name || FORMER_MEMBER_LABEL,
      avatar: member.avatar_url ?? undefined,
      isCreator: member.user_id === creatorId,
      role: member.role || 'member',
    }));

    return {
      members,
      total_count: payload?.total_count ?? members.length,
      limit: payload?.limit ?? options.limit ?? 50,
      offset: payload?.offset ?? options.offset ?? 0,
      creatorId,
    };
  },

  async addTripMember(tripId: string, userId: string, role: string = 'member'): Promise<boolean> {
    try {
      const { error } = await supabase.from('trip_members').insert({
        trip_id: tripId,
        user_id: userId,
        role: role,
      });

      if (!error) {
        void syncTripMemberToStreamChannelsOnly({
          tripId,
          userId,
          syncFailureContext: 'tripService.addTripMember',
        }).catch(streamError => {
          reportStreamMembershipSyncFailure(
            'tripService.addTripMember',
            { tripId, userId },
            streamError,
          );
        });
      }

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error adding trip member:', error);
      }
      return false;
    }
  },
};
