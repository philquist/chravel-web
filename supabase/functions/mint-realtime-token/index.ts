/**
 * mint-realtime-token — the "setup endpoint" AI SDK 7's `useRealtime` fetches on
 * connect(). The SDK does `fetch(api.token, { method:'POST', body:{sessionConfig} })`
 * with NO Authorization header, and expects back `{ token, url, tools }`. It then
 * opens the WebSocket via the gateway model's getWebSocketConfig({token, url}).
 *
 * So this function:
 *   1. Authenticates the user from the `?jwt=` query param (the SDK can't send the
 *      Authorization header) — or the Authorization header for direct/manual calls.
 *   2. Mints a short-lived Vercel AI Gateway realtime client secret via the exact
 *      contract the AI SDK uses (POST /v1/realtime/client-secrets, {model, expiresIn}).
 *   3. Constructs the WS url the SDK expects and returns the concierge tool set.
 *
 * Hosted on Supabase (Deno) so Lovable preview + prod share one code path — a Vercel
 * `/api/*` function only exists on the chravel.app host and gets deleted by Lovable.
 *
 * config.toml: verify_jwt = false (we auth from the query param ourselves).
 * Secret required (Supabase Functions env): AI_GATEWAY_API_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getToolsForVoice } from '../_shared/concierge/toolRegistry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ALLOWED_MODELS = new Set<string>([
  'openai/gpt-realtime-2',
  'openai/gpt-realtime-1.5',
  'openai/gpt-realtime-mini',
]);
const DEFAULT_MODEL = 'openai/gpt-realtime-2';
// If the account's plan can't mint the requested model, fall back to this one.
const FALLBACK_MODEL = 'openai/gpt-realtime-mini';
const TOKEN_TTL_SECONDS = 600;

const MINT_RATE_LIMIT_MAX = 30;
const MINT_RATE_LIMIT_WINDOW_SECONDS = 3600;

// Exact contract used by @ai-sdk/gateway's mintRealtimeClientSecret / getWebSocketConfig.
const GATEWAY_HOST = 'https://ai-gateway.vercel.sh';
const CLIENT_SECRET_URL = `${GATEWAY_HOST}/v1/realtime/client-secrets`;
const GATEWAY_PROTOCOL_VERSION = '0.0.1';

interface RealtimeToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

function realtimeTools(): RealtimeToolDefinition[] {
  return getToolsForVoice().map(decl => ({
    type: 'function',
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters as unknown as Record<string, unknown>,
  }));
}

/** WS url the SDK opens: wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=<model> */
function realtimeWsUrl(model: string): string {
  const url = new URL(`${GATEWAY_HOST.replace(/^http/, 'ws')}/v4/ai/realtime-model`);
  url.searchParams.set('ai-model-id', model);
  return url.toString();
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function isMintRateLimited(jwt: string, userId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_rate_limit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rate_key: `realtime-token:${userId}`,
        max_requests: MINT_RATE_LIMIT_MAX,
        window_seconds: MINT_RATE_LIMIT_WINDOW_SECONDS,
      }),
    });
    if (!resp.ok) return false; // fail open
    const rows = (await resp.json()) as Array<{ allowed?: boolean }> | { allowed?: boolean };
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.allowed === false;
  } catch {
    return false; // fail open
  }
}

/** Mint the client secret for one model via the exact AI SDK gateway contract. */
async function mintClientSecret(
  model: string,
  gatewayKey: string,
): Promise<
  { ok: true; token: string; expiresAt?: number } | { ok: false; status: number; body: string }
> {
  const resp = await fetch(CLIENT_SECRET_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gatewayKey}`,
      'ai-gateway-protocol-version': GATEWAY_PROTOCOL_VERSION,
      'ai-gateway-auth-method': 'api-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, expiresIn: TOKEN_TTL_SECONDS }),
  });
  const raw = await resp.text();
  if (!resp.ok) {
    return { ok: false, status: resp.status, body: raw.slice(0, 300) };
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, body: `non-JSON: ${raw.slice(0, 200)}` };
  }
  const token =
    (parsed.token as string | undefined) ??
    (parsed.value as string | undefined) ??
    ((parsed.client_secret as Record<string, unknown> | undefined)?.value as string | undefined);
  const expiresAt =
    (parsed.expiresAt as number | undefined) ?? (parsed.expires_at as number | undefined);
  if (!token) {
    return {
      ok: false,
      status: 502,
      body: `no token in response: ${JSON.stringify(parsed).slice(0, 200)}`,
    };
  }
  return { ok: true, token, expiresAt };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  const reqUrl = new URL(req.url);
  // The SDK cannot send an Authorization header to api.token, so accept the JWT from
  // the query string; still accept the header for direct/manual calls.
  const jwt =
    reqUrl.searchParams.get('jwt') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Authentication required' }, 401, corsHeaders);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Invalid authentication' }, 401, corsHeaders);

  if (await isMintRateLimited(jwt, user.id)) {
    return json(
      { error: 'Too many voice session requests. Please wait and retry.' },
      429,
      corsHeaders,
    );
  }

  const requested = reqUrl.searchParams.get('model') || DEFAULT_MODEL;
  const primary = ALLOWED_MODELS.has(requested) ? requested : DEFAULT_MODEL;
  const candidates = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

  const gatewayKey = Deno.env.get('AI_GATEWAY_API_KEY');
  if (!gatewayKey) {
    console.error('[mint-realtime-token] AI_GATEWAY_API_KEY missing from Supabase secrets');
    return json(
      { error: 'Realtime voice is not configured (AI_GATEWAY_API_KEY missing in Supabase).' },
      500,
      corsHeaders,
    );
  }

  let lastErr = '';
  for (const model of candidates) {
    const result = await mintClientSecret(model, gatewayKey);
    if (result.ok) {
      return json(
        {
          token: result.token,
          url: realtimeWsUrl(model),
          tools: realtimeTools(),
          expiresAt: result.expiresAt,
          model,
        },
        200,
        corsHeaders,
      );
    }
    lastErr = `${model} → ${result.status}: ${result.body}`;
    console.error(`[mint-realtime-token] gateway mint failed: ${lastErr}`);
  }
  return json({ error: `Gateway mint failed. ${lastErr}` }, 502, corsHeaders);
});
