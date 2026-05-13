import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireSecrets } from '../_shared/validateSecrets.ts';
import { getBearerToken } from '../_shared/authHeaders.ts';
import { VOICE_FUNCTION_DECLARATIONS, VOICE_ADDENDUM } from '../_shared/voiceToolDeclarations.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let OPENAI_API_KEY: string;
  try {
    OPENAI_API_KEY = requireSecrets(['OPENAI_API_KEY'])['OPENAI_API_KEY'];
  } catch {
    return new Response(JSON.stringify({ error: 'Service configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bearerToken = getBearerToken(authHeader);
  if (!bearerToken) {
    return new Response(JSON.stringify({ error: 'Invalid authentication header format' }), {
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
  } = await supabase.auth.getUser(bearerToken);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const tripId = typeof body?.tripId === 'string' ? body.tripId.trim() : '';
  const fallbackVoice = (Deno.env.get('OPENAI_REALTIME_VOICE') || 'echo').trim();
  const voice = typeof body?.voice === 'string' ? body.voice.trim() : fallbackVoice;

  if (!tripId) {
    return new Response(JSON.stringify({ error: 'tripId is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: membership } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return new Response(JSON.stringify({ error: 'Not a member of this trip' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const model = (Deno.env.get('OPENAI_REALTIME_MODEL') || 'gpt-realtime-2').trim();

  const prompt = `You are the Chravel AI Concierge for trip ${tripId}. ${VOICE_ADDENDUM}`;

  const safetyId = await sha256Hex(user.id);

  const resp = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyId,
    },
    body: JSON.stringify({
      model,
      voice,
      modalities: ['audio', 'text'],
      instructions: prompt,
      tool_choice: 'auto',
      tools: VOICE_FUNCTION_DECLARATIONS.map(t => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }),
  });

  const payload = await resp.text();
  if (!resp.ok) {
    console.error('[create-openai-realtime-session] openai session create failed', {
      status: resp.status,
      statusText: resp.statusText,
      body: payload,
      tripId,
      userId: user.id,
    });
    return new Response(JSON.stringify({ error: 'Failed to create realtime session' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(payload, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
