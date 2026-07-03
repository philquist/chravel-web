/**
 * Client transport helpers for bidirectional realtime voice (OpenAI Realtime via
 * the Vercel AI Gateway).
 *
 * Three server round-trips, all authenticated with the user's Supabase JWT:
 *  1. buildRealtimeSetupUrl     → the URL AI SDK `useRealtime` POSTs to on connect(); the
 *                                 Supabase `mint-realtime-token` function mints a short-lived
 *                                 AI Gateway client secret (provider key stays server-side)
 *                                 and returns the WS url + concierge tools.
 *  2. fetchRealtimeSessionConfig→ Supabase `realtime-voice-session` builds the
 *                                 trip-aware system prompt + the user's chosen voice.
 *  3. executeRealtimeTool       → Supabase `execute-concierge-tool` runs a tool call
 *                                 the model emits (same secured path as the text concierge).
 *
 * Steps 1 and 2 are independent and should be fired in parallel before connecting.
 */
import {
  supabase,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_ANON_KEY,
} from '@/integrations/supabase/client';

/** Realtime models routable through the AI Gateway. Must match api/realtime-token.ts. */
export const REALTIME_VOICE_MODELS = [
  'openai/gpt-realtime-2',
  'openai/gpt-realtime-1.5',
  'openai/gpt-realtime-mini',
] as const;

export type RealtimeVoiceModelId = (typeof REALTIME_VOICE_MODELS)[number];
export const DEFAULT_REALTIME_VOICE_MODEL: RealtimeVoiceModelId = 'openai/gpt-realtime-2';

/** OpenAI/Gateway realtime tool shape (RealtimeModelV4ToolDefinition). */
export interface RealtimeToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeSessionConfigResponse {
  instructions: string;
  voice: string;
  tools: RealtimeToolDefinition[];
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }
  return accessToken;
}

/**
 * Build the URL AI SDK `useRealtime` uses as its `api.token` — the "setup endpoint"
 * the SDK POSTs to on connect() (with `{sessionConfig}`, and crucially NO Authorization
 * header). It returns `{token, url, tools}` from `mint-realtime-token`.
 *
 * Because the SDK sends no auth header, the caller's JWT is passed as a query param so
 * the function can authenticate + rate-limit the user (HTTPS-encrypted, short-lived JWT).
 * The `apikey` query param satisfies Supabase's function gateway (verify_jwt=false).
 */
export async function buildRealtimeSetupUrl(
  model: RealtimeVoiceModelId = DEFAULT_REALTIME_VOICE_MODEL,
): Promise<string> {
  const accessToken = await getAccessToken();
  const params = new URLSearchParams({
    jwt: accessToken,
    model,
    apikey: SUPABASE_PUBLIC_ANON_KEY,
  });
  return `${SUPABASE_PROJECT_URL}/functions/v1/mint-realtime-token?${params.toString()}`;
}

/**
 * Preflight the setup endpoint before handing it to the SDK. The SDK swallows the
 * response body on failure (it throws bare "Failed to fetch realtime setup: <status>"),
 * so a misconfiguration would be illegible in the overlay. This sends the exact same
 * POST the SDK sends; on failure it surfaces the server's own error text (e.g. the
 * Gateway's reason: invalid key, model unavailable, insufficient credits).
 * The minted token is discarded — it is single-use, short-lived, and the SDK mints
 * its own on connect(); the mint endpoint's rate limit budgets for both calls.
 */
export async function preflightRealtimeSetup(
  setupUrl: string,
  sessionConfig: unknown,
): Promise<void> {
  const resp = await fetch(setupUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionConfig }),
  });
  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      /* non-JSON body — use raw text */
    }
    const detail = message ? `: ${message.slice(0, 300)}` : '';
    throw new Error(`Voice setup failed (${resp.status})${detail}`);
  }
}

/** Fetch the trip-aware system prompt + tool set for the realtime session. */
export async function fetchRealtimeSessionConfig(
  tripId: string,
): Promise<RealtimeSessionConfigResponse> {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/realtime-voice-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLIC_ANON_KEY,
    },
    body: JSON.stringify({ tripId }),
  });
  if (!resp.ok) {
    const detail = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? 'Failed to load voice session config.');
  }
  return (await resp.json()) as RealtimeSessionConfigResponse;
}

/**
 * Execute a tool call the realtime model emitted, via the same secured edge function
 * the text concierge uses. Model-agnostic: identical security (capability tokens,
 * trip-access checks, rate limits, idempotency for mutating tools).
 */
export async function executeRealtimeTool(
  tripId: string,
  toolName: string,
  args: Record<string, unknown>,
  toolCallId?: string,
): Promise<unknown> {
  const accessToken = await getAccessToken();
  // execute-concierge-tool only applies idempotency for MUTATING_TOOL_NAMES, so it is
  // safe to always send a key. Prefer one the model already provided in args, then the
  // stable realtime tool-call id so a retry of the SAME call collapses (avoids double
  // mutations), and only fall back to a fresh UUID when neither is available.
  const idempotencyKey =
    typeof args.idempotency_key === 'string' && args.idempotency_key.trim()
      ? args.idempotency_key.trim()
      : toolCallId && toolCallId.trim()
        ? toolCallId.trim()
        : crypto.randomUUID();

  const resp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/execute-concierge-tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLIC_ANON_KEY,
    },
    body: JSON.stringify({ toolName, args, tripId, idempotencyKey }),
  });

  const payload = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detail = (payload as { error?: string } | null)?.error ?? `Tool ${toolName} failed.`;
    // Return a structured error so the model can narrate it instead of throwing the
    // whole session into an error state.
    return { success: false, error: detail };
  }
  return payload;
}
