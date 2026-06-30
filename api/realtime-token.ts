/**
 * Vercel Edge Function: mint a short-lived AI Gateway realtime ephemeral token.
 *
 * Why this exists: bidirectional realtime voice needs a WebSocket the browser can
 * open directly to the model provider, but the provider/Gateway credential must
 * never reach the browser. This function authenticates the caller (Supabase JWT)
 * and mints a short-lived client secret via the Vercel AI Gateway. The browser
 * connects to the Gateway with that secret only — the long-lived AI_GATEWAY_API_KEY
 * stays server-side. This is the transport piece the prior Gemini Live attempt
 * lacked (Supabase Edge Functions can't host a WebSocket upgrade).
 *
 * Auth: caller must pass a valid Supabase user JWT in the Authorization header.
 * Secrets (Vercel project env): AI_GATEWAY_API_KEY (used by the `gateway` default
 * instance), SUPABASE_ANON_KEY (to verify the caller's JWT).
 *
 * Edge runtime: Web Standards API only (no @vercel/node).
 */
import { gateway } from 'ai';

export const config = {
  runtime: 'edge',
};

// Realtime models routable through the AI Gateway. Keep in sync with the client.
const ALLOWED_MODELS = new Set<string>([
  'openai/gpt-realtime-2',
  'openai/gpt-realtime-1.5',
  'openai/gpt-realtime-mini',
]);
const DEFAULT_MODEL = 'openai/gpt-realtime-2';

// Short-lived: the secret only needs to live long enough to open the socket.
const TOKEN_TTL_SECONDS = 600;

const SUPABASE_PROJECT_REF = 'jmjiyekmxwsxkfnqwyaa';

function resolveSupabaseUrl(): string {
  return (
    (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
    `https://${SUPABASE_PROJECT_REF}.supabase.co`
  );
}

function resolveSupabaseAnonKey(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env?.SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY || undefined;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Verify the caller's Supabase JWT by asking the Supabase Auth API who it belongs
 * to. Real verification (not just decoding) so randoms can't mint tokens and burn
 * Gateway spend.
 */
async function verifySupabaseUser(authHeader: string): Promise<{ id: string } | null> {
  const anonKey = resolveSupabaseAnonKey();
  if (!anonKey) {
    console.error('[realtime-token] SUPABASE_ANON_KEY missing — cannot verify caller');
    return null;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const resp = await fetch(`${resolveSupabaseUrl()}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id?: string };
    return user?.id ? { id: user.id } : null;
  } catch (err) {
    console.error('[realtime-token] user verification failed:', err);
    return null;
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return json({ error: 'Authentication required' }, 401);
  }

  const user = await verifySupabaseUser(authHeader);
  if (!user) {
    return json({ error: 'Invalid authentication' }, 401);
  }

  // Optional model override from the body, constrained to the allowlist.
  let model = DEFAULT_MODEL;
  try {
    const body = (await request.json()) as { model?: unknown };
    if (typeof body?.model === 'string' && ALLOWED_MODELS.has(body.model)) {
      model = body.model;
    }
  } catch {
    // No/invalid body → use default model.
  }

  if (!(typeof process !== 'undefined' && process.env?.AI_GATEWAY_API_KEY)) {
    console.error('[realtime-token] AI_GATEWAY_API_KEY missing');
    return json({ error: 'Realtime voice is not configured.' }, 500);
  }

  try {
    const realtimeModel = gateway.experimental_realtime(model);
    const secret = await realtimeModel.doCreateClientSecret({
      expiresAfterSeconds: TOKEN_TTL_SECONDS,
    });
    return json({ token: secret.token, url: secret.url, expiresAt: secret.expiresAt, model }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[realtime-token] mint failed:', message);
    return json({ error: 'Failed to start realtime voice session.' }, 502);
  }
}
