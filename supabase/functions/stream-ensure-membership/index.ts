import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireSecrets, createMissingSecretResponse } from '../_shared/validateSecrets.ts';
import { verifyTripMembership } from '../_shared/verifyTripMembership.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const tripChannelId = (tripId: string) => `trip-${tripId}`;
const broadcastChannelId = (tripId: string) => `broadcast-${tripId}`;
const proChannelId = (channelId: string) => `channel-${channelId}`;

/**
 * Verify a user may access a pro role channel before we project them into the
 * matching Stream channel. Access resolves from three sources, in order:
 *   1. channel_members — the backfilled source of truth (see 20260710170000).
 *   2. channel_role_access → user_trip_roles — role-based grants.
 *   3. trip_channels.required_role_id → user_trip_roles — legacy single-role gate.
 * The channel must belong to the given trip. Never trust a client-supplied role.
 */
async function canAccessProChannel(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  tripId: string,
  channelId: string,
): Promise<{ allowed: boolean; error: boolean }> {
  // The channel must exist and belong to this trip.
  const { data: channel, error: channelError } = await adminClient
    .from('trip_channels')
    .select('id, trip_id, required_role_id')
    .eq('id', channelId)
    .maybeSingle();

  if (channelError) return { allowed: false, error: true };
  if (!channel || channel.trip_id !== tripId) return { allowed: false, error: false };

  // 1. Direct channel_members grant.
  const { data: memberRow, error: memberError } = await adminClient
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) return { allowed: false, error: true };
  if (memberRow) return { allowed: true, error: false };

  // Collect role ids that grant access: channel_role_access + legacy required_role_id.
  const { data: roleAccessRows, error: roleAccessError } = await adminClient
    .from('channel_role_access')
    .select('role_id')
    .eq('channel_id', channelId);
  if (roleAccessError) return { allowed: false, error: true };

  const grantingRoleIds = new Set<string>(
    (roleAccessRows || [])
      .map(row => row.role_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  if (typeof channel.required_role_id === 'string' && channel.required_role_id.length > 0) {
    grantingRoleIds.add(channel.required_role_id);
  }

  if (grantingRoleIds.size === 0) return { allowed: false, error: false };

  // 2 & 3. Does the user hold any granting role on this trip?
  const { data: userRoleRows, error: userRoleError } = await adminClient
    .from('user_trip_roles')
    .select('role_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (userRoleError) return { allowed: false, error: true };

  const allowed = (userRoleRows || []).some(
    row => typeof row.role_id === 'string' && grantingRoleIds.has(row.role_id),
  );
  return { allowed, error: false };
}

type ErrorCode =
  | 'invalid_method'
  | 'auth_required'
  | 'auth_invalid'
  | 'invalid_trip_id'
  | 'membership_verification_failed'
  | 'membership_required'
  | 'stream_api_failure'
  | 'broadcast_membership_projection_failed'
  | 'pro_channel_access_check_failed'
  | 'pro_channel_access_denied';

type ReasonCode =
  | 'invalid_http_method'
  | 'authentication_required'
  | 'authentication_invalid'
  | 'trip_id_missing'
  | 'trip_membership_check_failed'
  | 'trip_membership_required'
  | 'stream_membership_sync_failed'
  | 'stream_membership_synced'
  | 'broadcast_membership_sync_failed'
  | 'pro_channel_access_check_failed'
  | 'pro_channel_access_denied';

function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(
  corsHeaders: Record<string, string>,
  status: number,
  code: ErrorCode,
  reasonCode: ReasonCode,
  reason: string,
) {
  return jsonResponse({ success: false, code, reasonCode, reason }, status, corsHeaders);
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse(
      corsHeaders,
      405,
      'invalid_method',
      'invalid_http_method',
      'Method not allowed',
    );
  }

  try {
    const secrets = requireSecrets(['STREAM_API_KEY', 'STREAM_API_SECRET']);
    const STREAM_API_KEY = secrets['STREAM_API_KEY'];
    const STREAM_API_SECRET = secrets['STREAM_API_SECRET'];

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(
        corsHeaders,
        401,
        'auth_required',
        'authentication_required',
        'Authentication required',
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return errorResponse(
        corsHeaders,
        401,
        'auth_invalid',
        'authentication_invalid',
        'Invalid authentication',
      );
    }

    const body = await req.json().catch(() => ({}));
    const tripId = typeof body?.tripId === 'string' ? body.tripId.trim() : '';
    // Optional: when present, also project the caller into this pro role channel.
    const channelId = typeof body?.channelId === 'string' ? body.channelId.trim() : '';

    if (!tripId) {
      return errorResponse(
        corsHeaders,
        400,
        'invalid_trip_id',
        'trip_id_missing',
        'tripId is required',
      );
    }

    const { isMember, error: membershipError } = await verifyTripMembership(
      adminClient,
      user.id,
      tripId,
    );

    if (membershipError) {
      return errorResponse(
        corsHeaders,
        500,
        'membership_verification_failed',
        'trip_membership_check_failed',
        'Failed to verify trip membership',
      );
    }

    if (!isMember) {
      return errorResponse(
        corsHeaders,
        403,
        'membership_required',
        'trip_membership_required',
        'User is not a trip member',
      );
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('display_name, first_name, last_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    const displayName =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
      user.email?.split('@')[0] ||
      'Anonymous';

    const stream = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

    await stream.upsertUser({
      id: user.id,
      name: displayName,
      image: profile?.avatar_url || undefined,
      role: 'user',
    });

    await stream.channel('chravel-trip', tripChannelId(tripId)).addMembers([user.id]);

    // Optional pro role channel projection. Only runs when the caller passed a
    // channelId, and only after verifying they may access it — a trip member is
    // NOT automatically a member of every role channel in the trip. Runs before
    // the best-effort broadcast block so the caller's explicit request is honored
    // even if broadcast projection is skipped.
    if (channelId) {
      const access = await canAccessProChannel(adminClient, user.id, tripId, channelId);
      if (access.error) {
        return errorResponse(
          corsHeaders,
          500,
          'pro_channel_access_check_failed',
          'pro_channel_access_check_failed',
          'Failed to verify pro channel access',
        );
      }
      if (!access.allowed) {
        return errorResponse(
          corsHeaders,
          403,
          'pro_channel_access_denied',
          'pro_channel_access_denied',
          'User cannot access this channel',
        );
      }

      await stream.channel('chravel-channel', proChannelId(channelId)).addMembers([user.id]);
    }

    try {
      await stream.channel('chravel-broadcast', broadcastChannelId(tripId)).addMembers([user.id]);
    } catch (broadcastErr) {
      console.warn('[stream-ensure-membership] Broadcast addMembers failed', {
        tripId,
        userId: user.id,
        reason: broadcastErr instanceof Error ? broadcastErr.message : 'Unknown error',
      });
      return jsonResponse(
        {
          success: true,
          code: 'broadcast_membership_projection_failed',
          reasonCode: 'broadcast_membership_sync_failed',
          reason: 'Trip chat membership ensured; broadcast sync skipped',
        },
        200,
        corsHeaders,
      );
    }

    return jsonResponse(
      { success: true, code: 'ok', reasonCode: 'stream_membership_synced' },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing required secret')) {
      return createMissingSecretResponse(error, corsHeaders);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[stream-ensure-membership] Error:', message);

    return errorResponse(
      corsHeaders,
      500,
      'stream_api_failure',
      'stream_membership_sync_failed',
      'Failed to ensure Stream membership',
    );
  }
});
