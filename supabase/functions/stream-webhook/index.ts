import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createHmac } from 'node:crypto';
import {
  HANDLED_STREAM_CHANNEL_TYPES,
  HANDLED_STREAM_EVENT_TYPES,
  dedupeRecipients,
  normalizeMentionedUserIds,
  isUuid,
  parseStreamCid,
  resolveTripIdFromChannel,
} from './eventRouting.ts';
import {
  buildMentionNotificationRows,
  resolveEligibleMentionRecipients,
} from './mentionNotifications.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STREAM_WEBHOOK_SECRET = Deno.env.get('STREAM_WEBHOOK_SECRET') || '';
const STREAM_API_KEY = Deno.env.get('STREAM_API_KEY') || '';

type StreamWebhookEvent = {
  type?: string;
  id?: string;
  created_at?: string;
  cid?: string;
  channel_type?: string;
  channel_id?: string;
  channel?: {
    cid?: string;
    members?: Array<{ user_id?: string; user?: { id?: string } }>;
  };
  members?: Array<{ user_id?: string; user?: { id?: string } }>;
  message?: {
    id?: string;
    text?: string;
    user?: { id?: string; name?: string };
    cid?: string;
    mentioned_users?: Array<string | { id?: string; user_id?: string; user?: { id?: string } }>;
  };
};

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function verifySignature(payload: string, signatureHeader: string): boolean {
  if (!STREAM_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', STREAM_WEBHOOK_SECRET).update(payload).digest('hex');
  const provided = signatureHeader
    .replace(/^sha256=/i, '')
    .trim()
    .toLowerCase();
  return safeCompare(expected, provided);
}

/** Resolves Stream CID string from message, nested channel, event root, or type/id pair (PR #229). */
function resolveEffectiveCid(event: StreamWebhookEvent): string {
  return (
    event.message?.cid ||
    event.channel?.cid ||
    event.cid ||
    (event.channel_type && event.channel_id ? `${event.channel_type}:${event.channel_id}` : '') ||
    ''
  );
}

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

  const signature =
    req.headers.get('x-signature') ||
    req.headers.get('X-Signature') ||
    req.headers.get('signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing signature header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const requestApiKey = req.headers.get('x-api-key') || '';
  if (STREAM_API_KEY && requestApiKey && requestApiKey !== STREAM_API_KEY) {
    return new Response(JSON.stringify({ error: 'Invalid api key header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.text();
  if (!verifySignature(payload, signature)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let event: StreamWebhookEvent;
  try {
    event = JSON.parse(payload) as StreamWebhookEvent;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventType = event.type || 'unknown';
  const webhookId = req.headers.get('x-webhook-id') || req.headers.get('X-Webhook-Id');
  const eventId =
    webhookId || event.id || `${eventType}:${event.message?.id || crypto.randomUUID()}`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: idempotencyError } = await supabase.from('webhook_events').insert({
    event_id: eventId,
    event_type: `stream:${eventType}`,
    processed_at: new Date().toISOString(),
  });

  if (idempotencyError?.code === '23505') {
    await supabase.from('webhook_events').insert({
      event_id: `collision:${eventId}:${Date.now()}`,
      event_type: 'stream:webhook_dedupe_collision',
      processed_at: new Date().toISOString(),
    });

    console.log(
      JSON.stringify({
        event: 'webhook.dedupe.collision',
        source: 'stream-webhook',
        event_type: eventType,
        event_id: eventId,
      }),
    );

    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (idempotencyError) {
    console.error('[stream-webhook] idempotency insert failed:', idempotencyError.message);
    return new Response(JSON.stringify({ error: 'Failed to persist webhook idempotency record' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!HANDLED_STREAM_EVENT_TYPES.has(eventType)) {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: 'event_type_not_handled' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // Only message.new fans out notifications; avoid membership DB reads for update/delete.
  if (eventType !== 'message.new') {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: 'no_notification_side_effects' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const cid = resolveEffectiveCid(event);
  const { channelType, channelId } = parseStreamCid(cid);

  if (!channelType || !HANDLED_STREAM_CHANNEL_TYPES.has(channelType)) {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: 'channel_type_not_handled' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  if (!event.message?.id) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'missing_message_id' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const senderId = event.message?.user?.id;

  let recipients: string[] = [];
  const tripId = resolveTripIdFromChannel(channelType, channelId);
  const mentionedUserIds = dedupeRecipients(
    normalizeMentionedUserIds(event.message?.mentioned_users),
    senderId,
  );

  if (channelType === 'chravel-trip' || channelType === 'chravel-broadcast') {
    recipients = mentionedUserIds;
  } else if (channelType === 'chravel-channel') {
    recipients = mentionedUserIds;
  }

  if (recipients.length > 0) {
    const safeTripId = isUuid(tripId) ? tripId : null;

    // Filter recipients by notification preferences — only notify users who want mentions
    const validRecipients = recipients.filter(userId => isUuid(userId));
    const invalidRecipients = recipients.filter(userId => !isUuid(userId));

    if (invalidRecipients.length > 0) {
      console.warn('[stream-webhook] skipped non-uuid recipients', {
        count: invalidRecipients.length,
        sample: invalidRecipients.slice(0, 3),
      });
    }

    // Fetch notification preferences for all valid recipients
    let eligibleRecipients = validRecipients;
    if (validRecipients.length > 0) {
      const { data: prefData, error: prefError } = await supabase
        .from('notification_preferences')
        .select('user_id, mentions_only, chat_messages')
        .in('user_id', validRecipients);

      if (prefError) {
        console.warn(
          '[stream-webhook] failed to fetch notification_preferences; suppressing mention fanout (fail-closed)',
          prefError.message,
        );
      }
      eligibleRecipients = resolveEligibleMentionRecipients({
        validRecipients,
        preferenceRows: prefData ?? null,
        preferenceError: prefError ? { message: prefError.message } : null,
      });

      const filteredCount = validRecipients.length - eligibleRecipients.length;
      if (filteredCount > 0) {
        console.log(
          `[stream-webhook] filtered ${filteredCount} recipients by notification preferences`,
        );
      }
    }

    const notificationRows = buildMentionNotificationRows({
      recipientIds: eligibleRecipients,
      senderName: event.message?.user?.name,
      messageText: event.message?.text,
      messageId: event.message.id,
      eventType,
      webhookId: webhookId || null,
      channelType,
      channelId,
      tripId: safeTripId,
    });

    if (notificationRows.length > 0) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .upsert(notificationRows, {
          onConflict: 'user_id,type,stream_message_id_mv',
          ignoreDuplicates: true,
        });
      if (notificationError) {
        console.error('[stream-webhook] notification insert failed:', notificationError.message);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
