/**
 * mint-realtime-token — server-side mint of a short-lived Vercel AI Gateway
 * realtime client secret, so the browser can open a WebSocket to the gateway
 * without ever seeing the long-lived AI_GATEWAY_API_KEY.
 *
 * Replaces the prior Vercel Node serverless function at /api/realtime-token,
 * which only existed on the chravel.app Vercel host. Lovable preview and
 * Lovable Cloud do not run /api/* Vercel functions, so the old client request
 * fell through the SPA catch-all and returned index.html — surfacing as
 * "Unexpected token '<', <!doctype ... is not valid JSON" in the UI.
 *
 * Hosted as a Supabase Edge Function so preview + prod use the same code path.
 *
 * Auth: caller must pass a valid Supabase user JWT (Authorization: Bearer).
 * Secrets (Supabase Functions env):
 *   - AI_GATEWAY_API_KEY  (Vercel AI Gateway → API Keys)
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 */
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/requireAuth.ts';

const ALLOWED_MODELS = new Set<string>([
  'openai/gpt-realtime-2',
  'openai/gpt-realtime-1.5',
  'openai/gpt-realtime-mini',
]);
const DEFAULT_MODEL = 'openai/gpt-realtime-2';
const TOKEN_TTL_SECONDS = 600;

// Per-user mint throttle. ~7 re-mints/hr in a continuous session — 30 is safe headroom.
const MINT_RATE_LIMIT_MAX = 30;
const MINT_RATE_LIMIT_WINDOW_SECONDS = 3600;

const AI_GATEWAY_REALTIME_URL = 'https://ai-gateway.vercel.sh/v1/realtime/client_secrets';

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Per-user mint throttle via the same SECURITY DEFINER `increment_rate_limit`
 * RPC the rest of the platform uses. Fails OPEN on transport errors so a
 * transient infra blip doesn't take voice down — the downstream
 * realtime-voice-session function still enforces a fail-closed per-user cap.
 */
async function isMintRateLimited(authToken: string, userId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return false;
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_rate_limit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rate_key: `realtime-token:${userId}`,
        max_requests: MINT_RATE_LIMIT_MAX,
        window_seconds: MINT_RATE_LIMIT_WINDOW_SECONDS,
      }),
    });
    if (!resp.ok) {
      console.error('[mint-realtime-token] rate-limit RPC failed (allowing):', resp.status);
      return false;
    }
    const rows = (await resp.json()) as Array<{ allowed?: boolean }> | { allowed?: boolean };
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.allowed === false;
  } catch (err) {
    console.error('[mint-realtime-token] rate-limit RPC error (allowing):', err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const auth = await requireAuth(req, corsHeaders);
  if (auth.error) return auth.response;
  const user = auth.user;

  // Pull the raw bearer back out for the throttle RPC (auth.uid() context).
  const authToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (await isMintRateLimited(authToken, user.id)) {
    return json(
      { error: 'Too many voice session requests. Please wait a bit and try again.' },
      429,
      corsHeaders,
    );
  }

  // Optional model override from the body, constrained to the allowlist.
  let model = DEFAULT_MODEL;
  try {
    const body = (await req.json()) as { model?: unknown };
    if (typeof body?.model === 'string' && ALLOWED_MODELS.has(body.model)) {
      model = body.model;
    }
  } catch {
    // No / invalid body → default model.
  }

  const gatewayKey = Deno.env.get('AI_GATEWAY_API_KEY');
  if (!gatewayKey) {
    console.error('[mint-realtime-token] AI_GATEWAY_API_KEY missing');
    return json({ error: 'Realtime voice is not configured.' }, 500, corsHeaders);
  }

  try {
    const resp = await fetch(AI_GATEWAY_REALTIME_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        expires_after_seconds: TOKEN_TTL_SECONDS,
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      console.error(
        `[mint-realtime-token] gateway ${resp.status} for ${model}: ${raw.slice(0, 300)}`,
      );
      // Surface the gateway's reason (model unavailable / credits / enablement) so the
      // overlay shows something actionable instead of "unexpected error".
      return json(
        { error: `Gateway mint failed (${resp.status}): ${raw.slice(0, 300)}`, model },
        502,
        corsHeaders,
      );
    }

    // The gateway response shape is { value | token, ws_url | url, expires_at }.
    // Accept either field name so a minor schema change doesn't break the client.
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error('[mint-realtime-token] gateway returned non-JSON:', raw.slice(0, 300));
      return json({ error: 'Gateway returned an unexpected response.' }, 502, corsHeaders);
    }

    const token =
      (parsed.token as string | undefined) ??
      (parsed.value as string | undefined) ??
      ((parsed.client_secret as Record<string, unknown> | undefined)?.value as string | undefined);
    const url =
      (parsed.url as string | undefined) ??
      (parsed.ws_url as string | undefined) ??
      (parsed.websocket_url as string | undefined);
    const expiresAt =
      (parsed.expiresAt as number | undefined) ??
      (parsed.expires_at as number | undefined) ??
      undefined;

    if (!token || !url) {
      console.error(
        '[mint-realtime-token] gateway response missing token/url:',
        JSON.stringify(parsed).slice(0, 300),
      );
      return json({ error: 'Gateway response missing token or url.' }, 502, corsHeaders);
    }

    return json({ token, url, expiresAt, model }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mint-realtime-token] mint failed for ${model}:`, message);
    return json(
      { error: `Gateway mint failed: ${message.slice(0, 300)}`, model },
      502,
      corsHeaders,
    );
  }
});
