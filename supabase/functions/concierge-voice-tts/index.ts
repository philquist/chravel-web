// Concierge Voice TTS — auth-gated proxy to Lovable AI Gateway openai/gpt-4o-mini-tts.
// Body: { text, voice?, format? } → returns audio bytes (MP3 by default).
// Keeps LOVABLE_API_KEY server-side.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/requireAuth.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const TTS_MODEL = 'openai/gpt-4o-mini-tts';
const MAX_TEXT_CHARS = 4000;

const VOICES = [
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
] as const;
const DEFAULT_VOICE = 'coral';
const VOICE_SET = new Set<string>(VOICES);

const FORMAT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  if (!LOVABLE_API_KEY) {
    console.error('[concierge-voice-tts] LOVABLE_API_KEY missing');
    return new Response(JSON.stringify({ error: 'TTS not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const auth = await requireAuth(req, cors);
  if (auth.error) return auth.response;

  let body: { text?: unknown; voice?: unknown; format?: unknown; stream?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) {
    return new Response(JSON.stringify({ error: 'Missing "text"' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (rawText.length > MAX_TEXT_CHARS) {
    return new Response(
      JSON.stringify({ error: `Text exceeds ${MAX_TEXT_CHARS} character limit` }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Pronunciation normalization: TTS engines read "Chravel" with a hard "Ch".
  // Brand stays spelled "Chravel" everywhere visually; only the audio stream
  // hears "Travel". Applies to every voice automatically.
  const text = rawText
    .replace(/\bFrequent Chraveler\b/g, 'Frequent Traveler')
    .replace(/\bfrequent chraveler\b/g, 'frequent traveler')
    .replace(/\bChravelers\b/g, 'Travelers')
    .replace(/\bchravelers\b/g, 'travelers')
    .replace(/\bChraveler\b/g, 'Traveler')
    .replace(/\bchraveler\b/g, 'traveler')
    .replace(/\bChravel\b/g, 'Travel')
    .replace(/\bchravel\b/g, 'travel');

  const requestedVoice = typeof body.voice === 'string' ? body.voice.toLowerCase().trim() : '';
  const resolvedVoice = VOICE_SET.has(requestedVoice) ? requestedVoice : DEFAULT_VOICE;
  const usedFallback = requestedVoice !== '' && resolvedVoice !== requestedVoice;

  const wantsStream = body.stream === true;
  const requestedFormat = typeof body.format === 'string' ? body.format.toLowerCase() : 'mp3';
  // For SSE streaming we use PCM (raw 24kHz 16-bit signed LE mono) so the
  // client can decode and schedule chunks as they arrive via WebAudio.
  const format = wantsStream ? 'pcm' : FORMAT_MIME[requestedFormat] ? requestedFormat : 'mp3';

  const gatewayPayload: Record<string, unknown> = {
    model: TTS_MODEL,
    input: text,
    voice: resolvedVoice,
    response_format: format,
  };
  if (wantsStream) gatewayPayload.stream_format = 'sse';

  let res: Response;
  try {
    res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gatewayPayload),
      signal: req.signal,
    });
  } catch (err) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499, headers: cors });
    }
    console.error('[concierge-voice-tts] Gateway fetch failed:', err);
    return new Response(JSON.stringify({ error: 'Voice service unreachable' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[concierge-voice-tts] Gateway ${res.status}: ${errText.slice(0, 500)}`);
    let message = `Voice generation failed (${res.status})`;
    let status = 502;
    if (res.status === 402) {
      message = 'AI credits exhausted. Please add credits to continue.';
      status = 402;
    } else if (res.status === 429) {
      message = 'Rate limit reached. Try again in a moment.';
      status = 429;
    } else if (res.status === 403 || res.status === 404) {
      message = 'Voice service not enabled for this workspace.';
      status = res.status;
    } else {
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        /* keep default */
      }
    }
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (wantsStream) {
    // Pass the SSE body through untouched so the client can decode PCM deltas
    // and start playback before generation finishes.
    return new Response(res.body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'x-voice': resolvedVoice,
        'x-voice-fallback': usedFallback ? 'true' : 'false',
        'x-tts-stream': 'sse-pcm-24000',
      },
    });
  }

  const audioBuffer = await res.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': FORMAT_MIME[format] || 'audio/mpeg',
      'x-voice': resolvedVoice,
      'x-voice-fallback': usedFallback ? 'true' : 'false',
      'Cache-Control': 'no-store',
    },
  });
});
