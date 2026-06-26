import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { DEMO_TRIPS, getDemoTripType } from '../_shared/ogUtils.ts';

type TripPreview = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  trip_type: string | null;
  member_count: number;
  active_invite_code?: string | null;
  description?: string | null;
};

type TripMemberAccessRow = {
  user_id: string;
  status?: string | null;
};

const isMissingTripMemberStatusError = (error: { message?: string } | null): boolean => {
  const message = error?.message ?? '';
  return message.includes('status') && message.includes('trip_members');
};

const generateInviteCode = (): string => {
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `chravel${randomPart}`;
};

async function createActiveInviteForTrip(
  supabaseClient: ReturnType<typeof createClient>,
  tripId: string,
  createdBy: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode();
    const { error } = await supabaseClient.from('trip_invites').insert({
      trip_id: tripId,
      code,
      created_by: createdBy,
      is_active: true,
      current_uses: 0,
      require_approval: true,
      expires_at: null,
    });

    if (!error) {
      return code;
    }

    // Retry only on unique-code collisions.
    if (error.code !== '23505') {
      console.error('[get-trip-preview] Failed to auto-create invite', {
        tripId,
        error: error.message,
      });
      return null;
    }
  }

  return null;
}

async function fetchTripMemberAccessRow(
  supabaseClient: ReturnType<typeof createClient>,
  tripId: string,
  userId: string,
): Promise<TripMemberAccessRow | null> {
  const statusQuery = await supabaseClient
    .from('trip_members')
    .select('user_id, status')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!statusQuery.error) {
    return statusQuery.data as TripMemberAccessRow | null;
  }

  if (!isMissingTripMemberStatusError(statusQuery.error)) {
    throw statusQuery.error;
  }

  const fallbackQuery = await supabaseClient
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fallbackQuery.error) {
    throw fallbackQuery.error;
  }

  return fallbackQuery.data as TripMemberAccessRow | null;
}

serve(async (req): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === 'POST' ? await req.json() : {};
    const tripId = body.tripId ?? new URL(req.url).searchParams.get('tripId');
    const requestedEnsureInvite = body.ensureInvite === true;

    if (!tripId || typeof tripId !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'tripId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Demo trips
    const demo = DEMO_TRIPS[tripId];
    if (demo) {
      const trip: TripPreview = {
        id: tripId,
        name: demo.title,
        destination: demo.location,
        start_date: null,
        end_date: null,
        cover_image_url: demo.coverPhoto,
        trip_type: getDemoTripType(tripId),
        member_count: demo.participantCount,
        description: demo.description,
      };

      return new Response(JSON.stringify({ success: true, trip }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    // Authenticate caller (required for invite code disclosure and creation)
    let authedUserId: string | null = null;
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (!userError && userData.user) {
        authedUserId = userData.user.id;
      }
    }

    const { data: tripRow, error: tripError } = await supabaseClient
      .from('trips')
      .select(
        'id, name, destination, start_date, end_date, cover_image_url, trip_type, description, created_by',
      )
      .eq('id', tripId)
      .maybeSingle();

    if (tripError || !tripRow) {
      return new Response(JSON.stringify({ success: false, error: 'Trip not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { count: memberCount } = await supabaseClient
      .from('trip_members')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', tripId);

    const trip: TripPreview = {
      id: tripRow.id,
      name: tripRow.name,
      destination: tripRow.destination,
      start_date: tripRow.start_date,
      end_date: tripRow.end_date,
      cover_image_url: tripRow.cover_image_url,
      trip_type: tripRow.trip_type,
      member_count: memberCount ?? 0,
      description: tripRow.description,
    };

    // Verify trip membership (only active members/admins/creator may see or create invite codes)
    let isTripMember = false;
    if (authedUserId) {
      if (tripRow.created_by === authedUserId) {
        isTripMember = true;
      } else {
        const memberRow = await fetchTripMemberAccessRow(supabaseClient, tripId, authedUserId);
        isTripMember =
          !!memberRow &&
          (memberRow.status === null ||
            memberRow.status === undefined ||
            memberRow.status === 'active');
      }
    }

    if (isTripMember) {
      const nowIso = new Date().toISOString();
      const { data: inviteRow } = await supabaseClient
        .from('trip_invites')
        .select('code')
        .eq('trip_id', tripId)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let activeInviteCode = inviteRow?.code ?? null;

      if (!activeInviteCode && requestedEnsureInvite) {
        activeInviteCode = await createActiveInviteForTrip(
          supabaseClient,
          tripId,
          tripRow.created_by,
        );
      }

      trip.active_invite_code = activeInviteCode;
    }

    return new Response(JSON.stringify({ success: true, trip }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
