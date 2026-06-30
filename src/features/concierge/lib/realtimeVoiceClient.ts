/**
 * Client transport helpers for bidirectional realtime voice (OpenAI Realtime via
 * the Vercel AI Gateway).
 *
 * Three server round-trips, all authenticated with the user's Supabase JWT:
 *  1. fetchRealtimeToken        → Supabase `mint-realtime-token` mints a short-lived
 *                                 AI Gateway client secret (provider key stays server-side).
 *  2. fetchRealtimeSessionConfig→ Supabase `realtime-voice-session` builds the
 *                                 trip-aware system prompt + the concierge tool set.
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

export interface RealtimeTokenResponse {
  token: string;
  url: string;
  expiresAt?: number;
  model: string;
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
 * Mint a short-lived realtime token from the `mint-realtime-token` Supabase Edge
 * Function. Lives on Lovable Cloud so preview + prod use the same code path —
 * the prior Vercel `/api/realtime-token` only existed on the chravel.app host
 * and returned the SPA `index.html` everywhere else (the "Unexpected token '<'"
 * symptom in the voice overlay).
 */
export async function fetchRealtimeToken(
  model: RealtimeVoiceModelId = DEFAULT_REALTIME_VOICE_MODEL,
): Promise<RealtimeTokenResponse> {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/mint-realtime-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLIC_ANON_KEY,
    },
    body: JSON.stringify({ model }),
  });
  if (!resp.ok) {
    // Surface the real status + body so the overlay shows the precise cause (e.g.
    // 401 missing auth, 429 rate limit, 502 with the Gateway's own message).
    const raw = await resp.text().catch(() => '');
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      /* non-JSON body — use the raw text */
    }
    const snippet = message ? `: ${message.slice(0, 200)}` : '';
    throw new Error(`Voice token request failed (${resp.status})${snippet}`);
  }
  return (await resp.json()) as RealtimeTokenResponse;
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
