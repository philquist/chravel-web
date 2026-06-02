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

type ErrorCode =
  | 'invalid_method'
  | 'auth_required'
  | 'auth_invalid'
  | 'invalid_trip_id'
  | 'membership_verification_failed'
  | 'membership_required'
  | 'stream_api_failure'
  | 'broadcast_membership_projection_failed';

type ReasonCode =
  | 'invalid_http_method'
  | 'authentication_required'
  | 'authentication_invalid'
  | 'trip_id_missing'
  | 'trip_membership_check_failed'
  | 'trip_membership_required'
  | 'stream_membership_sync_failed'
  | 'stream_membership_synced'
  | 'broadcast_membership_sync_failed';

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
