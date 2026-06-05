/**
 * Stream Token Generator — Supabase Edge Function
 *
 * Authenticates the user via their Supabase JWT, then generates a GetStream
 * user token for the client-side StreamChat connection.
 *
 * POST /stream-token
 * Headers: Authorization: Bearer <supabase-jwt>
 * Returns: { token: string, userId: string, apiKey: string }
 *
 * Security:
 *   - Validates Supabase JWT before issuing Stream token
 *   - STREAM_API_SECRET never leaves server
 *   - Token is an IDENTITY token scoped to the authenticated user only. It is
 *     intentionally trip-agnostic and grants NO channel access on its own —
 *     Stream isolation is enforced by per-channel membership (see
 *     stream-ensure-membership) plus channel-type permissions (see
 *     stream-setup-permissions). Do NOT add a tripId/membership gate here: the
 *     frontend (src/services/stream/streamTokenService.ts) calls this with an
 *     empty body, and chat would break.
 *   - Issuance is recorded to security_audit_log (best-effort, fail-open).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireSecrets, createMissingSecretResponse } from '../_shared/validateSecrets.ts';
import { logSecurityEvent } from '../_shared/logSecurityEvent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async req => {
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
    // ── Validate secrets ──────────────────────────────────────────────────
    const secrets = requireSecrets(['STREAM_API_KEY', 'STREAM_API_SECRET']);
    const STREAM_API_KEY = secrets['STREAM_API_KEY'];
    const STREAM_API_SECRET = secrets['STREAM_API_SECRET'];

    // ── Auth ──────────────────────────────────────────────────────────────
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch profile for Stream user upsert ──────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, first_name, last_name, avatar_url')
      .eq('user_id', user.id)
      .single();

    const displayName =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
      user.email?.split('@')[0] ||
      'Anonymous';

    // ── Generate Stream token ─────────────────────────────────────────────
    const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

    // Upsert user to Stream with current profile data
    await serverClient.upsertUser({
      id: user.id,
      name: displayName,
      image: profile?.avatar_url || undefined,
      role: 'user',
    });

    // Create user token (expires in 24 hours)
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const token = serverClient.createToken(user.id, exp);

    // Best-effort audit trail (fail-open — never blocks token issuance).
    const adminClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await logSecurityEvent(adminClient, {
      userId: user.id,
      action: 'stream.token_issued',
      tableName: 'stream',
      metadata: { exp },
    });

    return new Response(
      JSON.stringify({
        token,
        userId: user.id,
        apiKey: STREAM_API_KEY,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing required secret')) {
      return createMissingSecretResponse(error, corsHeaders);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[stream-token] Error:', message);

    return new Response(JSON.stringify({ error: 'Failed to generate Stream token' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
