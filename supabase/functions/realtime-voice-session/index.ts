/**
 * realtime-voice-session
 *
 * Builds the server-authoritative session configuration for a bidirectional
 * realtime voice session (OpenAI Realtime via the Vercel AI Gateway):
 *   - instructions: the trip-aware concierge system prompt (voice variant)
 *   - voice:        the user's selected OpenAI voice (plan-gated)
 *   - tools:        the full concierge tool set in OpenAI realtime shape
 *
 * The ephemeral Gateway token is minted separately by the Supabase `mint-realtime-token`
 * function (the AI SDK's setup endpoint). This endpoint only composes context + tools,
 * reusing the exact same TripContextBuilder + assemblePrompt + tool registry as the text
 * concierge, so the voice path never drifts from the text path.
 *
 * Auth: user JWT (browser). RLS applies. Trip membership is verified.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getBearerToken } from '../_shared/authHeaders.ts';
import { checkRateLimit } from '../_shared/security.ts';
import { verifyConciergeTripAccess } from '../_shared/concierge/tripAccess.ts';
import { resolveUsagePlanForUser } from '../_shared/concierge/usagePolicy.ts';
import { isFeatureEnabled } from '../_shared/featureFlags.ts';
import { isSuperAdminEmail } from '../_shared/superAdmins.ts';
import { QUERY_CLASS_SLICES, TripContextBuilder } from '../_shared/contextBuilder.ts';
import { assemblePrompt } from '../_shared/concierge/promptAssembler.ts';
// getToolsForVoice lives in the tool registry (the single source of truth);
// voiceToolDeclarations.ts only re-exports the evaluated VOICE_FUNCTION_DECLARATIONS.
import { getToolsForVoice } from '../_shared/concierge/toolRegistry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// OpenAI realtime voices — mirrors the existing TTS voice catalog (concierge-voice-tts).
const VOICE_SET = new Set<string>([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);
const DEFAULT_VOICE = 'coral';

interface RealtimeToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

/** Adapt a registry ToolDeclaration to the OpenAI realtime tool shape. */
function toRealtimeTools(): RealtimeToolDefinition[] {
  return getToolsForVoice().map(decl => ({
    type: 'function',
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters as unknown as Record<string, unknown>,
  }));
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = getBearerToken(authHeader);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { tripId?: unknown; replyLanguage?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
    if (!tripId) {
      return new Response(JSON.stringify({ error: 'tripId (non-empty string) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const replyLanguage =
      typeof body.replyLanguage === 'string' && body.replyLanguage.trim()
        ? body.replyLanguage.trim()
        : undefined;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;

    // Per-user throttle on session starts (mirrors execute-concierge-tool's limiter).
    // Bounds how often the normal client flow can spin up a realtime session.
    const rlResult = await checkRateLimit(
      supabase,
      `realtime-voice-session:${userId}`,
      30,
      3600,
      userId,
      'realtime-voice-session',
    );
    if (!rlResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many voice session requests. Try again later.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' },
        },
      );
    }

    // Trip existence ≠ trip access — verify membership.
    const tripAccess = await verifyConciergeTripAccess(supabase, tripId, userId);
    if (!tripAccess.allowed) {
      return new Response(JSON.stringify({ error: tripAccess.error }), {
        status: tripAccess.status || 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve plan + the premium-preferences kill switch in parallel. The flag
    // fails CLOSED: if the flag store is unreachable we skip preference grounding
    // rather than override an operator's disable. This never blocks the session
    // (voice still works) — it only drops premium grounding, which during a DB
    // outage would degrade anyway since resolveUsagePlanForUser / the preferences
    // fetch read the same database.
    const [planResolution, premiumPreferencesEnabled] = await Promise.all([
      resolveUsagePlanForUser(supabase, userId),
      isFeatureEnabled('concierge_premium_preferences', false),
    ]);
    const isPaidUser = planResolution.usagePlan !== 'free' || isSuperAdminEmail(user.email ?? null);
    // Preference grounding is premium-only AND kill-switchable (mirrors lovable-concierge).
    const preferenceGroundingEnabled = isPaidUser && premiumPreferencesEnabled;

    // Voice selection: paid users keep their saved voice; free users use the default.
    let voice = DEFAULT_VOICE;
    if (isPaidUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('concierge_voice')
        .eq('id', userId)
        .maybeSingle();
      const saved = profile?.concierge_voice as string | null | undefined;
      if (saved && VOICE_SET.has(saved)) {
        voice = saved;
      }
    }

    // Build trip context (full slice set so the voice agent can answer anything),
    // then assemble the voice-variant system prompt (includes VOICE_ADDENDUM).
    const tripContext = await TripContextBuilder.buildContextWithCache(
      tripId,
      userId,
      authHeader,
      preferenceGroundingEnabled,
      QUERY_CLASS_SLICES['trip_summary'],
    ).catch(error => {
      console.error('[realtime-voice-session] context build failed:', error);
      return null;
    });

    const instructions = assemblePrompt({
      queryClass: 'trip_summary',
      tripContext,
      isVoice: true,
      replyLanguage,
    });

    return new Response(JSON.stringify({ instructions, voice, tools: toRealtimeTools() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[realtime-voice-session] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
