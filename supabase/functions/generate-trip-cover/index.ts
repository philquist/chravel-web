// Generate an AI trip cover photo (Frequent Chraveler tier, 10/month cap).
//
// Flow:
//   1. Auth user via Authorization header.
//   2. Check feature flag `ai_cover_generation_enabled`.
//   3. Enforce `can_edit_trip_cover(trip_id, user_id)` — mirrors DB RLS.
//   4. Enforce entitlement: frequent-chraveler (or super_admin bypass).
//   5. Enforce monthly cap via ai_cover_generations count.
//   6. Call Lovable AI Gateway (openai/gpt-image-2, quality=low, 1536x1024).
//   7. Upload to trip-covers bucket, update trips.cover_image_url,
//      insert ai_cover_generations row.
//   8. Return { publicUrl, remaining }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/requireAuth.ts';
import { requireSecrets } from '../_shared/validateSecrets.ts';

const MONTHLY_CAP = 10;
const MODEL = 'openai/gpt-image-2';
const IMAGE_SIZE = '1536x1024';
const COST_ESTIMATE_CENTS = 2; // conservative estimate for openai/gpt-image-2 low

interface RequestBody {
  tripId?: string;
  stylePrompt?: string; // reserved; ignored in v1 (one-click)
}

interface GatewayImageResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string; code?: string };
}

function json(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function isSuperAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  let secrets: Record<string, string>;
  try {
    secrets = requireSecrets(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LOVABLE_API_KEY']);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Missing required secrets' },
      500,
      corsHeaders,
    );
  }

  const auth = await requireAuth(req, corsHeaders);
  if (auth.error) return auth.response;
  const userId = auth.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const tripId = body.tripId?.trim();
  if (!tripId) return json({ error: 'tripId is required' }, 400, corsHeaders);

  const admin = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_ROLE_KEY);

  // Feature flag kill switch
  {
    const { data: flag } = await admin
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'ai_cover_generation_enabled')
      .maybeSingle();
    if (flag && flag.enabled === false) {
      return json({ error: 'AI cover generation is currently disabled' }, 503, corsHeaders);
    }
  }

  // Permission — mirrors trip-covers RLS
  const { data: canEdit, error: permErr } = await admin.rpc('can_edit_trip_cover', {
    _trip_id: tripId,
    _user_id: userId,
  });
  if (permErr) return json({ error: permErr.message }, 500, corsHeaders);
  if (!canEdit) return json({ error: 'Not allowed to edit this trip cover' }, 403, corsHeaders);

  // Entitlement — Frequent Chraveler or super_admin
  const superAdmin = await isSuperAdmin(admin, userId);
  if (!superAdmin) {
    const { data: entitlements } = await admin
      .from('user_entitlements')
      .select('plan, status, current_period_end, purchase_type')
      .eq('user_id', userId)
      .in('purchase_type', ['subscription', 'pass'])
      .order('updated_at', { ascending: false });

    const activePlans = (entitlements || []).filter(row => {
      const okStatus = row.status === 'active' || row.status === 'trialing';
      if (!okStatus) return false;
      if (!row.current_period_end) return true;
      return new Date(row.current_period_end).getTime() >= Date.now();
    });
    const isFC = activePlans.some(row => row.plan === 'frequent-chraveler');
    if (!isFC) {
      return json(
        {
          error: 'AI cover generation is a Frequent Chraveler benefit',
          code: 'upgrade_required',
        },
        402,
        corsHeaders,
      );
    }
  }

  // Monthly cap check
  const periodMonth = new Date().toISOString().slice(0, 7) + '-01';
  const { count, error: countErr } = await admin
    .from('ai_cover_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('period_month', periodMonth);
  if (countErr) return json({ error: countErr.message }, 500, corsHeaders);
  const used = count ?? 0;
  if (!superAdmin && used >= MONTHLY_CAP) {
    return json(
      {
        error: `You've used all ${MONTHLY_CAP} AI cover generations this month`,
        code: 'quota_exceeded',
        remaining: 0,
      },
      429,
      corsHeaders,
    );
  }

  // Load trip context for prompt
  const { data: trip, error: tripErr } = await admin
    .from('trips')
    .select('id, title, destination, trip_type, category')
    .eq('id', tripId)
    .maybeSingle();
  if (tripErr || !trip) return json({ error: 'Trip not found' }, 404, corsHeaders);

  const title = (trip.title as string) || 'a trip';
  const destination = (trip.destination as string) || '';
  const category = (trip.category as string) || '';
  const contextBits = [destination && `in ${destination}`, category && `— ${category}`]
    .filter(Boolean)
    .join(' ');
  const prompt =
    `A stunning cinematic travel cover photograph evoking "${title}" ${contextBits}. ` +
    `Wide landscape composition, golden hour lighting, editorial travel-magazine quality, ` +
    `rich color, atmospheric depth, no people in foreground, no text, no logos, no watermarks.`;

  // Call Lovable AI Gateway
  const gatewayRes = await fetch('https://ai.gateway.lovable.dev/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secrets.LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: IMAGE_SIZE,
      quality: 'low',
      n: 1,
    }),
  });

  if (!gatewayRes.ok) {
    const text = await gatewayRes.text().catch(() => '');
    const status = gatewayRes.status === 429 || gatewayRes.status === 402 ? gatewayRes.status : 502;
    return json(
      { error: `Image generation failed (${gatewayRes.status})`, detail: text.slice(0, 400) },
      status,
      corsHeaders,
    );
  }

  const payload = (await gatewayRes.json()) as GatewayImageResponse;
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) {
    return json(
      { error: payload.error?.message || 'Image generation returned no data' },
      502,
      corsHeaders,
    );
  }

  const bytes = base64ToUint8Array(b64);
  const filePath = `${tripId}/cover-ai-${Date.now()}-${crypto.randomUUID()}.png`;
  const { error: uploadErr } = await admin.storage.from('trip-covers').upload(filePath, bytes, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'image/png',
  });
  if (uploadErr) return json({ error: `Upload failed: ${uploadErr.message}` }, 500, corsHeaders);

  const { data: pub } = admin.storage.from('trip-covers').getPublicUrl(filePath);
  const publicUrl = pub.publicUrl;

  const { error: updateErr } = await admin
    .from('trips')
    .update({ cover_image_url: publicUrl })
    .eq('id', tripId);
  if (updateErr) {
    await admin.storage
      .from('trip-covers')
      .remove([filePath])
      .catch(() => null);
    return json({ error: `Failed to attach cover: ${updateErr.message}` }, 500, corsHeaders);
  }

  // Increment counter only after success
  await admin.from('ai_cover_generations').insert({
    user_id: userId,
    trip_id: tripId,
    period_month: periodMonth,
    model: MODEL,
    cost_estimate_cents: COST_ESTIMATE_CENTS,
  });

  const remaining = superAdmin ? -1 : Math.max(0, MONTHLY_CAP - used - 1);
  return json({ publicUrl, remaining, cap: MONTHLY_CAP }, 200, corsHeaders);
});
