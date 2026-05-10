/**
 * execute-concierge-tool
 *
 * Server-side bridge for concierge tool calls (text + voice).
 *
 * Supports two auth modes:
 * 1. User JWT (browser) — standard Supabase JWT, RLS applies
 * 2. Short-lived agent assertion (LiveKit agent) + service-role bearer transport
 *
 * Security:
 *  - LiveKit agent calls must present a signed short-lived assertion header
 *  - Assertion claims (user_id/trip_id/allowed_tools/exp) are verified server-side
 *  - Rate limiting applies to both auth modes, keyed by userId
 *  - Google API calls happen server-side (keys never reach the browser)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { generateCapabilityToken } from '../_shared/security/capabilityTokens.ts';
import { executeToolSecurely } from '../_shared/security/toolRouter.ts';
import { checkRateLimit } from '../_shared/security.ts';
import { getBearerToken } from '../_shared/authHeaders.ts';
import { verifyConciergeTripAccess } from '../_shared/concierge/tripAccess.ts';
import { verifyAgentAssertion } from '../_shared/security/agentAssertions.ts';
import {
  checkMonthlyTokenBudget,
  resolveUsagePlanForUser,
} from '../_shared/concierge/usagePolicy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body early — assertion flow needs tripId from body for claim matching.
    let body: { toolName?: unknown; args?: unknown; tripId?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Two auth modes:
    // 1. Agent assertion JWT (LiveKit agent) in X-Agent-Assertion header.
    // 2. User JWT (browser) in Authorization header.
    const token = getBearerToken(authHeader);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agentAssertionHeader = req.headers.get('X-Agent-Assertion');
    const hasAgentAssertion =
      typeof agentAssertionHeader === 'string' && agentAssertionHeader.trim().length > 0;

    let supabase;
    let userId: string;
    let agentAllowedTools: string[] | null = null;

    if (hasAgentAssertion) {
      let assertion;
      try {
        assertion = await verifyAgentAssertion(agentAssertionHeader!.trim());
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid agent assertion' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = assertion.user_id;
      if (assertion.trip_id !== body.tripId) {
        return new Response(JSON.stringify({ error: 'tripId mismatch with agent assertion' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      agentAllowedTools = assertion.allowed_tools;
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else {
      // Browser call — validate user JWT, Supabase RLS applies.
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
      userId = user.id;
    }
    // Per-user AI tool rate limit: 20 requests per hour (both auth modes)
    const rlResult = await checkRateLimit(
      supabase,
      `execute-concierge-tool:${userId}`,
      20,
      3600,
      userId,
      'execute-concierge-tool',
    );
    if (!rlResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many AI tool requests. Try again in an hour.' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': '3600',
          },
        },
      );
    }

    // ── Validate tool request ─────────────────────────────────────────────
    const { toolName, args, tripId } = body;

    if (typeof toolName !== 'string' || !toolName) {
      return new Response(JSON.stringify({ error: 'toolName (string) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof tripId !== 'string' || !tripId.trim()) {
      return new Response(JSON.stringify({ error: 'tripId (non-empty string) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tripIdStr = tripId.trim();
    const argsObj: Record<string, unknown> =
      args !== null && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};

    const tripAccess = await verifyConciergeTripAccess(supabase, tripIdStr, userId);
    if (!tripAccess.allowed) {
      return new Response(JSON.stringify({ error: tripAccess.error }), {
        status: tripAccess.status || 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (
      agentAllowedTools &&
      !agentAllowedTools.includes(toolName) &&
      !agentAllowedTools.includes('*')
    ) {
      return new Response(JSON.stringify({ error: 'Tool not permitted by agent assertion' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const usagePlanResolution = await resolveUsagePlanForUser(supabase, userId);
    const tokenBudgetResult = await checkMonthlyTokenBudget(
      supabase,
      userId,
      usagePlanResolution.usagePlan,
    );
    if (!tokenBudgetResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Monthly AI budget reached for this plan. Please upgrade or try again next month.',
          budget: tokenBudgetResult,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // ── Resolve location context from trip basecamp for proximity-aware tools ──
    let locationContext: { lat?: number; lng?: number } | null = null;
    try {
      const { data: tripData } = await supabase
        .from('trips')
        .select('latitude, longitude')
        .eq('id', tripIdStr)
        .maybeSingle();
      if (tripData?.latitude && tripData?.longitude) {
        locationContext = { lat: tripData.latitude, lng: tripData.longitude };
      }
    } catch {
      // Non-critical — tools still work without location bias
    }

    // ── Execute ────────────────────────────────────────────────────────────
    // Generate a short-lived capability token scoped to this user + trip.
    const capabilityToken = await generateCapabilityToken({
      user_id: userId,
      trip_id: tripIdStr,
      allowed_tools: [toolName],
    });

    const result = await executeToolSecurely(
      supabase,
      capabilityToken,
      toolName,
      argsObj,
      locationContext,
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[execute-concierge-tool] Unhandled error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
