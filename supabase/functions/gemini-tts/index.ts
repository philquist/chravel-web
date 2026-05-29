import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { pickPrimaryEntitlement } from '../_shared/entitlementSelection.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_TTS_API_KEY') || Deno.env.get('GEMINI_API_KEY');
const GEMINI_TTS_MODEL = (
  Deno.env.get('GEMINI_TTS_MODEL') || 'gemini-3.1-flash-tts-preview'
).trim();
const VOICE_TTS_FREE_FOR_ALL = Deno.env.get('VOICE_TTS_FREE_FOR_ALL') === 'true';

const HARDCODED_PRIMARY_VOICE = 'Charon';
const HARDCODED_FALLBACK_VOICE = 'Puck';
const MAX_TEXT_CHARS = 1800;
const MAX_STYLE_CHARS = 160;
const FREE_TIER_DAILY_LIMIT = 30;
const EXPLORER_TIER_DAILY_LIMIT = 100;

const CONCIERGE_STYLE_DEFAULT = 'warm, calm, concise premium travel concierge voice';

/** Status codes from Gemini API that warrant a fallback voice retry. */
const FALLBACK_RETRY_STATUSES = new Set([400, 403, 404, 429]);

const GEMINI_TTS_VOICES = new Set([
  'Charon',
  'Kore',
  'Fenrir',
  'Aoede',
  'Puck',
  'Leda',
  'Orus',
  'Zephyr',
]);

const isActiveEntitlement = (status?: string | null, periodEnd?: string | null): boolean => {
  if (status !== 'active' && status !== 'trialing') return false;
  if (!periodEnd) return true;
  const parsed = Date.parse(periodEnd);
  if (Number.isNaN(parsed)) return true;
  return parsed > Date.now();
};

const mapPlanToDailyLimit = (plan?: string | null): number | null => {
  if (!plan || plan === 'free') return FREE_TIER_DAILY_LIMIT;
  if (plan === 'explorer' || plan === 'plus') return EXPLORER_TIER_DAILY_LIMIT;
  return null;
};

/** Resolve a raw voice name to a valid Gemini TTS voice. */
const toGeminiVoiceName = (rawVoice: string): string => {
  const trimmed = rawVoice.trim();
  if (!trimmed) return HARDCODED_PRIMARY_VOICE;

  // Direct match (case-insensitive)
  const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  if (GEMINI_TTS_VOICES.has(titleCase)) return titleCase;

  // Legacy Google Cloud TTS format (e.g. en-US-Chirp3-HD-Charon): extract last segment
  if (trimmed.includes('-')) {
    const segments = trimmed.split('-');
    const last = segments[segments.length - 1];
    const lastTitle = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
    if (GEMINI_TTS_VOICES.has(lastTitle)) return lastTitle;
  }

  return HARDCODED_PRIMARY_VOICE;
};

async function getAppSetting(key: string): Promise<string | null> {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[gemini-tts] SUPABASE_SERVICE_ROLE_KEY missing; skipping app_settings lookup');
      return null;
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      console.warn(`[gemini-tts] app_settings lookup failed for "${key}":`, error.message);
      return null;
    }
    return data?.value ?? null;
  } catch (e) {
    console.warn(`[gemini-tts] app_settings exception for "${key}":`, e);
    return null;
  }
}

type GeminiPart = {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  data?: string;
  mimeType?: string;
};

const getAudioPart = (payload: any): GeminiPart | null => {
  const parts: GeminiPart[] =
    payload?.candidates?.[0]?.content?.parts && Array.isArray(payload.candidates[0].content.parts)
      ? payload.candidates[0].content.parts
      : [];
  for (const part of parts) {
    if (part?.inlineData?.data) return part;
    if (part?.data && typeof part.data === 'string') return part;
  }
  return null;
};

async function callGeminiTTS(text: string, voiceName: string, style: string): Promise<Response> {
  const promptText = style ? `[${style}] ${text}` : text;

  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!GEMINI_API_KEY) {
    console.error('[gemini-tts] GEMINI_API_KEY is not set');
    return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization required' }), {
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
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: {
    text?: string;
    voiceName?: string;
    style?: string;
    tripId?: string;
    messageId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const text = (body.text || '').trim().slice(0, MAX_TEXT_CHARS);
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve voice from app_settings with hardcoded fallbacks
  const [dbPrimaryVoice, dbFallbackVoice] = await Promise.all([
    getAppSetting('tts_primary_voice_id'),
    getAppSetting('tts_fallback_voice_id'),
  ]);

  const primaryVoice = toGeminiVoiceName(dbPrimaryVoice || HARDCODED_PRIMARY_VOICE);
  const fallbackVoice = toGeminiVoiceName(dbFallbackVoice || HARDCODED_FALLBACK_VOICE);
  const resolvedVoice = body.voiceName ? toGeminiVoiceName(body.voiceName) : primaryVoice;

  const style = (body.style || CONCIERGE_STYLE_DEFAULT)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STYLE_CHARS);

  const today = new Date().toISOString().slice(0, 10);
  if (!VOICE_TTS_FREE_FOR_ALL) {
    const { data: entitlementRows } = await supabase
      .from('user_entitlements')
      .select('user_id, plan, status, current_period_end, purchase_type, updated_at')
      .eq('user_id', user.id)
      .in('purchase_type', ['subscription', 'pass'])
      .order('updated_at', { ascending: false });

    const entitlementData = pickPrimaryEntitlement(entitlementRows || []);
    const dailyLimit: number | null =
      entitlementData &&
      isActiveEntitlement(entitlementData.status, entitlementData.current_period_end)
        ? mapPlanToDailyLimit(entitlementData.plan)
        : mapPlanToDailyLimit(
            (
              await supabase
                .from('profiles')
                .select('app_role')
                .eq('user_id', user.id)
                .maybeSingle()
            ).data?.app_role,
          );

    const { data: usageRow } = await supabase
      .from('tts_usage')
      .select('request_count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();

    const currentCount = usageRow?.request_count ?? 0;
    if (dailyLimit !== null && currentCount >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: 'Daily TTS limit reached. Upgrade to Pro for expanded voice responses.',
          limit: dailyLimit,
          used: currentCount,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  console.log(
    `[gemini-tts] Request: voice=${resolvedVoice}, textLen=${text.length}, user=${user.id}`,
  );

  let geminiRes: Response;
  let usedFallback = false;

  try {
    geminiRes = await callGeminiTTS(text, resolvedVoice, style);

    // Retry with fallback voice on retryable errors
    if (
      !geminiRes.ok &&
      FALLBACK_RETRY_STATUSES.has(geminiRes.status) &&
      resolvedVoice !== fallbackVoice
    ) {
      const errBody = await geminiRes.text().catch(() => '');
      console.warn(
        `[gemini-tts] Primary voice ${resolvedVoice} returned ${geminiRes.status}: ${errBody}. Retrying with fallback voice ${fallbackVoice}`,
      );

      geminiRes = await callGeminiTTS(text, fallbackVoice, style);
      usedFallback = true;
      console.log(`[gemini-tts] Fallback voice result: status=${geminiRes.status}`);
    }
  } catch (fetchError) {
    console.error('[gemini-tts] Fetch to Gemini TTS failed:', fetchError);
    return new Response(JSON.stringify({ error: 'Failed to reach Gemini TTS service' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => '');
    console.error(`[gemini-tts] Gemini TTS error ${geminiRes.status}: ${errBody}`);

    let detail = `Gemini TTS returned ${geminiRes.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.error?.message) detail = parsed.error.message;
      else if (typeof parsed?.detail === 'string') detail = parsed.detail;
    } catch {
      // use default detail
    }

    return new Response(JSON.stringify({ error: detail }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let audioBytes: Uint8Array;
  let mimeType: string;

  try {
    const payload = await geminiRes.json();
    const audioPart = getAudioPart(payload);
    const audioBase64 = audioPart?.inlineData?.data || audioPart?.data;
    mimeType = audioPart?.inlineData?.mimeType || audioPart?.mimeType || 'audio/wav';

    if (!audioBase64) {
      throw new Error('Missing audio data in response');
    }

    audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  } catch (parseError) {
    console.error('[gemini-tts] Failed to parse Gemini TTS audio payload:', parseError);
    return new Response(JSON.stringify({ error: 'Voice service returned invalid audio payload' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: upsertError } = await supabase.rpc('increment_tts_usage', {
    p_user_id: user.id,
    p_date: today,
  });

  if (upsertError) {
    console.warn('[gemini-tts] Failed to increment usage:', upsertError.message);
  }

  const latencyMs = Date.now() - startedAt;
  console.log(
    `[gemini-tts] success user=${user.id} trip=${body.tripId || 'none'} message=${body.messageId || 'none'} chars=${text.length} latency_ms=${latencyMs} model=${GEMINI_TTS_MODEL} voice=${usedFallback ? fallbackVoice : resolvedVoice} fallback=${usedFallback}`,
  );

  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': mimeType,
    'Cache-Control': 'no-store',
  };

  if (usedFallback) {
    responseHeaders['X-Voice-Fallback'] = 'true';
  }

  return new Response(audioBytes as unknown as BodyInit, {
    status: 200,
    headers: responseHeaders,
  });
});
