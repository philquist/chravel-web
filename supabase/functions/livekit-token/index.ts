/**
 * LiveKit Token Generator — Supabase Edge Function
 *
 * Authenticates the user via their Supabase JWT, creates a LiveKit room with
 * metadata + agent dispatch via RoomServiceClient, then returns a join token.
 * The room is ephemeral (one per voice session) and auto-closes after 30s empty.
 *
 * POST /livekit-token
 * Body: { tripId: string, voice?: string }
 * Returns: { token: string, wsUrl: string, roomName: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireSecrets } from '../_shared/validateSecrets.ts';
import { getBearerToken } from '../_shared/authHeaders.ts';
import { generateAgentAssertion } from '../_shared/security/agentAssertions.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/**
 * Convert a LiveKit WSS URL to HTTPS for the RoomServiceClient.
 * RoomServiceClient uses HTTP/Twirp, not WebSocket.
 * wss://foo.livekit.cloud → https://foo.livekit.cloud
 */
function toHttpUrl(wssUrl: string): string {
  return wssUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Validate required secrets — requireSecrets() throws on missing keys
  let LIVEKIT_API_KEY: string;
  let LIVEKIT_API_SECRET: string;
  let LIVEKIT_URL: string;
  try {
    const secrets = requireSecrets(['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL']);
    LIVEKIT_API_KEY = secrets['LIVEKIT_API_KEY'];
    LIVEKIT_API_SECRET = secrets['LIVEKIT_API_SECRET'];
    LIVEKIT_URL = secrets['LIVEKIT_URL'];
  } catch (err) {
    console.error('[livekit-token] Missing secrets:', err);
    return new Response(JSON.stringify({ error: 'Service configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const bearerToken = getBearerToken(authHeader);
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Invalid authentication header format' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(bearerToken);

    if (authError || !user) {
      console.error('[livekit-token] Auth failed:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[livekit-token] token:auth_verified', { userId: user.id });

    // ── Parse Request ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const tripId = typeof body?.tripId === 'string' ? body.tripId.trim() : '';

    if (!tripId) {
      return new Response(JSON.stringify({ error: 'tripId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tripId)) {
      return new Response(JSON.stringify({ error: 'Invalid tripId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Verify Trip Membership (RLS check) ─────────────────────────────────
    const { data: membership, error: memberError } = await supabase
      .from('trip_members')
      .select('trip_id')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) {
      console.error('[livekit-token] Membership check failed:', memberError?.message);
      return new Response(JSON.stringify({ error: 'Not a member of this trip' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Create LiveKit Room + Generate Token ──────────────────────────────
    const shortId = crypto.randomUUID().split('-')[0];
    const roomName = `voice-${tripId}-${shortId}`;
    const ALLOWED_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];
    const rawVoice = typeof body?.voice === 'string' ? body.voice : 'Charon';
    const voice = ALLOWED_VOICES.includes(rawVoice) ? rawVoice : 'Charon';

    // Create the room explicitly via RoomServiceClient so metadata and agent
    // dispatch are set server-side. The previous approach of setting
    // (token as any).roomConfig was dead code — AccessToken.toJwt() does not
    // serialize arbitrary properties, and RoomConfiguration lacks a metadata field.
    const httpUrl = toHttpUrl(LIVEKIT_URL);
    const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    const agentAssertion = await generateAgentAssertion({
      user_id: user.id,
      trip_id: tripId,
      allowed_tools: [
        'searchPlaces',
        'searchWeb',
        'searchFlights',
        'searchHotels',
        'getHotelDetails',
        'getWeatherForecast',
        'searchImages',
        'getPlaceDetails',
        'getDirectionsETA',
        'getDistanceMatrix',
        'getStaticMapUrl',
        'makeReservation',
        'emitReservationDraft',
      ],
    });

    await roomService.createRoom({
      name: roomName,
      metadata: JSON.stringify({
        tripId,
        userId: user.id,
        voice,
        agentAssertion,
      }),
      emptyTimeout: 30,
      // intentional: RoomAgentDispatch requires fields we don't need for basic agent dispatch
      agents: [{ agentName: 'chravel-voice' } as any],
    });

    console.log('[livekit-token] room:created', { roomName, tripId, voice });

    // Generate a join-only token (room already exists, no roomCreate needed)
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.user_metadata?.display_name || user.email || 'User',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    console.log('[livekit-token] token:generated', {
      roomName,
      userId: user.id,
      tripId,
      voice,
    });

    return new Response(
      JSON.stringify({
        token: jwt,
        wsUrl: LIVEKIT_URL,
        roomName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[livekit-token] token:error', error);
    return new Response(JSON.stringify({ error: 'Failed to generate token' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
