import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyCronAuth } from '../_shared/cronGuard.ts';
import { requireSecrets, createMissingSecretResponse } from '../_shared/validateSecrets.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHANNEL_TYPES = ['chravel-trip', 'chravel-broadcast'] as const;
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

type ChannelType = (typeof CHANNEL_TYPES)[number];

type ReasonCode =
  | 'invalid_http_method'
  | 'authentication_required'
  | 'authentication_invalid'
  | 'trip_id_missing'
  | 'trip_membership_required'
  | 'trip_membership_check_failed'
  | 'invalid_batch_size'
  | 'reconcile_completed'
  | 'reconcile_failed';

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
  code: string,
  reasonCode: ReasonCode,
  reason: string,
) {
  return jsonResponse({ success: false, code, reasonCode, reason }, status, corsHeaders);
}

function getChannelId(channelType: ChannelType, tripId: string) {
  return channelType === 'chravel-trip' ? `trip-${tripId}` : `broadcast-${tripId}`;
}

async function reconcileChannelMembership(params: {
  stream: StreamChat;
  channelType: string;
  channelId: string;
  tripId: string;
  expectedUserIds: string[];
}) {
  const { stream, channelType, channelId, tripId, expectedUserIds } = params;
  const channel = stream.channel(channelType, channelId, { trip_id: tripId });
  await channel.create();

  const streamMembersResponse = await channel.queryMembers(
    {},
    { created_at: 1 },
    {
      limit: Math.max(expectedUserIds.length + 50, 100),
    },
  );

  const streamMembers = new Set(
    (streamMembersResponse.members || [])
      .map(member => member.user_id || member.user?.id)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
  );

  const expectedSet = new Set(expectedUserIds);
  const missingMembers = expectedUserIds.filter(userId => !streamMembers.has(userId));
  // Prune stale members: anyone on the Stream channel who is no longer an expected member
  // (removed from the trip / role). Previously add-only, so revoked members kept access.
  const staleMembers = Array.from(streamMembers).filter(userId => !expectedSet.has(userId));

  if (missingMembers.length > 0) {
    await channel.addMembers(missingMembers);
  }
  if (staleMembers.length > 0) {
    await channel.removeMembers(staleMembers);
  }

  return {
    channelType,
    channelId,
    expectedCount: expectedUserIds.length,
    missingBeforeRepair: missingMembers.length,
    repairedCount: missingMembers.length,
    staleRemoved: staleMembers.length,
  };
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
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
    const stream = StreamChat.getInstance(secrets['STREAM_API_KEY'], secrets['STREAM_API_SECRET']);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let scopedTripId: string | null = null;
    let cursor: string | null = null;
    let batchSize = DEFAULT_BATCH_SIZE;

    if (req.method === 'GET') {
      const guard = verifyCronAuth(req, corsHeaders);
      if (!guard.authorized) return guard.response!;
      const url = new URL(req.url);
      scopedTripId = url.searchParams.get('tripId');
      cursor = url.searchParams.get('cursor');
      const batchSizeRaw = url.searchParams.get('batchSize');
      if (batchSizeRaw) {
        const parsedBatchSize = Number.parseInt(batchSizeRaw, 10);
        if (
          Number.isNaN(parsedBatchSize) ||
          parsedBatchSize < 1 ||
          parsedBatchSize > MAX_BATCH_SIZE
        ) {
          return errorResponse(
            corsHeaders,
            400,
            'invalid_batch_size',
            'invalid_batch_size',
            `batchSize must be between 1 and ${MAX_BATCH_SIZE}`,
          );
        }
        batchSize = parsedBatchSize;
      }
    } else {
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
      scopedTripId = typeof body?.tripId === 'string' ? body.tripId.trim() : '';
      if (!scopedTripId) {
        return errorResponse(
          corsHeaders,
          400,
          'invalid_trip_id',
          'trip_id_missing',
          'tripId is required',
        );
      }

      const { data: membership, error: membershipError } = await adminClient
        .from('trip_members')
        .select('trip_id')
        .eq('trip_id', scopedTripId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        return errorResponse(
          corsHeaders,
          500,
          'membership_verification_failed',
          'trip_membership_check_failed',
          'Failed to verify trip membership',
        );
      }
      if (!membership) {
        return errorResponse(
          corsHeaders,
          403,
          'membership_required',
          'trip_membership_required',
          'User is not a trip member',
        );
      }
    }

    const tripIds: string[] = [];
    let nextCursor: string | null = null;

    if (scopedTripId && scopedTripId.length > 0) {
      tripIds.push(scopedTripId);
    } else {
      let query = adminClient
        .from('trips')
        .select('id')
        .order('id', { ascending: true })
        .limit(batchSize);
      if (cursor && cursor.length > 0) {
        query = query.gt('id', cursor);
      }

      const { data: tripRows, error: tripsError } = await query;
      if (tripsError) {
        throw new Error('Failed to load trip batch for reconciliation');
      }

      for (const row of tripRows || []) {
        if (typeof row.id === 'string' && row.id.length > 0) {
          tripIds.push(row.id);
        }
      }

      if (tripIds.length === batchSize) {
        nextCursor = tripIds[tripIds.length - 1] ?? null;
      }
    }

    const results: Array<Record<string, unknown>> = [];
    let repairedTotal = 0;

    for (const tripId of tripIds) {
      const { data: members, error: membersError } = await adminClient
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);

      if (membersError) {
        throw new Error(`Failed to load trip members for ${tripId}`);
      }

      const expectedUserIds = (members || [])
        .map(row => row.user_id)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);

      const tripChannelResults = [];
      // Trip + broadcast channels: expected members = all trip_members.
      for (const channelType of CHANNEL_TYPES) {
        const channelResult = await reconcileChannelMembership({
          stream,
          channelType,
          channelId: getChannelId(channelType, tripId),
          tripId,
          expectedUserIds,
        });
        repairedTotal += channelResult.repairedCount;
        tripChannelResults.push(channelResult);
      }

      // Pro role channels (chravel-channel): expected members come from channel_members
      // (the backfilled source of truth), NOT the whole trip. Previously these were never
      // reconciled at all, so role-channel members were never added to Stream.
      const { data: proChannels, error: proChannelsError } = await adminClient
        .from('trip_channels')
        .select('id')
        .eq('trip_id', tripId)
        .eq('is_archived', false);
      if (proChannelsError) {
        throw new Error(`Failed to load pro channels for ${tripId}`);
      }

      for (const proChannel of proChannels || []) {
        if (typeof proChannel.id !== 'string' || proChannel.id.length === 0) continue;
        const { data: channelMemberRows, error: channelMembersError } = await adminClient
          .from('channel_members')
          .select('user_id')
          .eq('channel_id', proChannel.id);
        if (channelMembersError) {
          throw new Error(`Failed to load channel_members for ${proChannel.id}`);
        }
        const channelExpected = (channelMemberRows || [])
          .map(row => row.user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        const channelResult = await reconcileChannelMembership({
          stream,
          channelType: 'chravel-channel',
          channelId: `channel-${proChannel.id}`,
          tripId,
          expectedUserIds: channelExpected,
        });
        repairedTotal += channelResult.repairedCount;
        tripChannelResults.push(channelResult);
      }

      results.push({
        tripId,
        expectedMemberCount: expectedUserIds.length,
        channels: tripChannelResults,
      });
    }

    return jsonResponse(
      {
        success: true,
        code: 'ok',
        reasonCode: 'reconcile_completed',
        batchSize,
        cursor,
        nextCursor,
        reconciledTrips: tripIds.length,
        repairedMembersTotal: repairedTotal,
        results,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing required secret')) {
      return createMissingSecretResponse(error, corsHeaders);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[stream-reconcile-membership] Error:', message);
    return errorResponse(
      corsHeaders,
      500,
      'stream_reconcile_failed',
      'reconcile_failed',
      'Failed to reconcile Stream memberships',
    );
  }
});
