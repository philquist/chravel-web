import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sendFcmV1, toFcmData } from '../_shared/fcmV1.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeCategory,
  type NotificationCategory,
  type NotificationPreferences,
} from '../_shared/notificationUtils.ts';
import {
  enforcePreferenceAtSendTime,
  type DeliveryChannel,
} from '../_shared/notificationDispatchPolicy.ts';
import { sendWebPushNotification, type WebPushSubscription } from '../_shared/webPushUtils.ts';
import {
  buildNotificationContent,
  type EmailContent,
  type NotificationContentType,
  type TripContext,
} from '../_shared/notificationContentBuilder.ts';
import { resolveEmailProviderSecrets } from '../_shared/emailDelivery.ts';

interface DispatchRequest {
  deliveryIds?: string[];
  notificationIds?: string[];
  channels?: DeliveryChannel[];
  limit?: number;
  dryRun?: boolean;
}

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  trip_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface DeliveryRow {
  id: string;
  notification_id: string;
  recipient_user_id: string;
  channel: DeliveryChannel;
  attempts: number;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface TripRow {
  id: string;
  name: string;
}

const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
const sendGridFromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'support@chravelapp.com';
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'support@chravelapp.com';
const internalSecret = Deno.env.get('NOTIFICATION_DISPATCH_SECRET');

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@chravel.app';

function getDisplayName(profile?: ProfileRow): string {
  if (!profile) return 'Someone';
  return (
    profile.display_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    (profile.email ? profile.email.split('@')[0] : null) ||
    'Someone'
  );
}

function mergePreferences(
  userId: string,
  raw?: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    user_id: userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(raw || {}),
  } as NotificationPreferences;
}

function isCategoryEnabled(
  category: NotificationCategory | null,
  prefs: NotificationPreferences,
): boolean {
  if (!category) return true;
  return prefs[category] === true;
}

function parseMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata;
}

function categoryToContentType(
  category: NotificationCategory | null,
  metadata: Record<string, unknown>,
): NotificationContentType | null {
  if (!category) return null;

  if (category === 'calendar_events') {
    if (metadata.bulk_import || metadata.import_session_id) return 'calendar_bulk_import';
    if (metadata.updated) return 'calendar_event_updated';
    return 'calendar_event_added';
  }

  const map: Record<string, NotificationContentType> = {
    broadcasts: 'broadcast_posted',
    payments: metadata.settled ? 'payment_settled' : 'payment_request',
    tasks: metadata.completed ? 'task_completed' : 'task_assigned',
    polls: 'poll_created',
    join_requests: metadata.approved ? 'join_request_approved' : 'join_request',
    basecamp_updates: 'basecamp_updated',
    trip_invites: 'trip_invite',
    calendar_bulk_import: 'calendar_bulk_import',
  };

  return map[category] || null;
}

function buildTripContextFromRow(
  notification: NotificationRow,
  tripById: Map<string, TripRow>,
  metadata: Record<string, unknown>,
): TripContext {
  const tripName = notification.trip_id ? tripById.get(notification.trip_id)?.name : undefined;

  const location =
    typeof metadata.location === 'string'
      ? metadata.location
      : Array.isArray(metadata.locations)
        ? (metadata.locations as string[])
        : undefined;

  return {
    tripName,
    location,
    startDate: typeof metadata.start_date === 'string' ? metadata.start_date : undefined,
    endDate: typeof metadata.end_date === 'string' ? metadata.end_date : undefined,
  };
}

function getActorUserId(metadata: Record<string, unknown>): string | undefined {
  const actorId =
    metadata.actor_user_id || metadata.sender_id || metadata.requester_id || metadata.created_by;
  return typeof actorId === 'string' ? actorId : undefined;
}

async function markDelivery(
  supabase: any,
  deliveryId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('notification_deliveries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);
}

async function logDeliveryAttempt(
  supabase: any,
  params: {
    userId: string;
    channel: DeliveryChannel;
    title: string;
    body: string;
    recipient?: string;
    status: 'sent' | 'failed' | 'skipped';
    error?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from('notification_logs').insert({
    user_id: params.userId,
    type: params.channel,
    title: params.title,
    body: params.body,
    recipient: params.recipient || null,
    external_id: params.externalId || null,
    status: params.status,
    error_message: params.error || null,
    success: params.status === 'sent' ? 1 : 0,
    failure: params.status === 'sent' ? 0 : 1,
    data: params.metadata || {},
    sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  });
}

async function sendEmail(
  to: string,
  subject: string,
  content: string,
): Promise<{
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}> {
  const provider = resolveEmailProviderSecrets({
    RESEND_API_KEY: resendApiKey,
    SENDGRID_API_KEY: sendGridApiKey,
  });
  if (!provider) {
    return {
      ok: false,
      error: 'No email provider configured (RESEND_API_KEY or SENDGRID_API_KEY)',
    };
  }

  if (provider.provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [to],
        subject,
        html: content,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Resend error ${response.status}: ${body.substring(0, 200)}` };
    }
    const json = await response.json().catch(() => null);
    return { ok: true, providerMessageId: json?.id };
  }

  const emailPayload = {
    personalizations: [{ to: [{ email: to }], subject }],
    from: { email: sendGridFromEmail, name: 'ChravelApp' },
    content: [
      { type: 'text/html', value: content },
      { type: 'text/plain', value: content.replace(/<[^>]+>/g, '') },
    ],
  };
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: `SendGrid error ${response.status}: ${body.substring(0, 200)}` };
  }

  return { ok: true };
}

async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<{
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  invalidTokens?: string[];
}> {
  // Set the iOS APNS badge (and Android via data.badgeCount) when provided, so
  // the home-screen app icon shows the unread count even with the app closed.
  const badge = typeof data?.badgeCount === 'number' ? (data.badgeCount as number) : undefined;

  const result = await sendFcmV1(tokens, {
    notification: { title, body },
    data: data ? toFcmData(data) : undefined,
    ...(badge !== undefined ? { apns: { payload: { aps: { badge } } } } : {}),
  });

  if (result.success.length > 0) {
    const partialNote =
      result.failed.length > 0 ? ` (${result.failed.length}/${tokens.length} tokens failed)` : '';
    return { ok: true, invalidTokens: result.invalidTokens, error: partialNote || undefined };
  }
  return {
    ok: false,
    error: `All ${result.failed.length} FCM V1 deliveries failed`,
    invalidTokens: result.invalidTokens,
  };
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (internalSecret) {
    const providedSecret = req.headers.get('x-notification-secret');
    if (providedSecret !== internalSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized dispatch request' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const body = (await req.json().catch(() => ({}))) as DispatchRequest;
    const limit = Math.min(Math.max(body.limit || 100, 1), 500);

    // Atomically claim queued deliveries via FOR UPDATE SKIP LOCKED to prevent
    // duplicate sends when concurrent cron invocations overlap.
    const { data: claimedRows, error: claimError } = await supabase.rpc(
      'claim_notification_deliveries',
      {
        p_limit: limit,
        p_channels: body.channels?.length ? body.channels : null,
        p_delivery_ids: body.deliveryIds?.length ? body.deliveryIds : null,
        p_notification_ids: body.notificationIds?.length ? body.notificationIds : null,
      },
    );

    if (claimError) {
      throw claimError;
    }

    const deliveries = (claimedRows || []) as DeliveryRow[];
    if (deliveries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No queued deliveries' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const notificationIds = [...new Set(deliveries.map(delivery => delivery.notification_id))];
    const { data: notificationRows, error: notificationsError } = await supabase
      .from('notifications')
      .select('id, user_id, title, message, type, trip_id, metadata')
      .in('id', notificationIds);

    if (notificationsError) {
      throw notificationsError;
    }

    const notifications = (notificationRows || []) as NotificationRow[];
    const notificationById = new Map<string, NotificationRow>(
      notifications.map(notification => [notification.id, notification]),
    );

    const recipientIds = [...new Set(notifications.map(notification => notification.user_id))];
    const tripIds = [
      ...new Set(notifications.map(notification => notification.trip_id).filter(Boolean)),
    ] as string[];

    const actorIds = [
      ...new Set(
        notifications
          .map(notification => getActorUserId(parseMetadata(notification.metadata)))
          .filter(Boolean),
      ),
    ] as string[];

    const profileIds = [...new Set([...recipientIds, ...actorIds])];

    const [
      { data: preferenceRows },
      { data: tripRows },
      { data: profileRows },
      { data: pushTokenRows },
      { data: webPushRows },
      { data: unreadRows },
    ] = await Promise.all([
      supabase.from('notification_preferences').select('*').in('user_id', recipientIds),
      tripIds.length
        ? supabase.from('trips').select('id, name').in('id', tripIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabase
            .from('profiles')
            .select('user_id, display_name, first_name, last_name, email')
            .in('user_id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      recipientIds.length
        ? supabase
            .from('push_device_tokens')
            .select('user_id, token')
            .in('user_id', recipientIds)
            .is('disabled_at', null)
        : Promise.resolve({ data: [], error: null }),
      recipientIds.length
        ? supabase
            .from('web_push_subscriptions')
            .select('*')
            .in('user_id', recipientIds)
            .eq('is_active', true)
        : Promise.resolve({ data: [], error: null }),
      // Unread notification rows for recipients — used to set the OS app-icon
      // badge count in the push payload. user_id only keeps the rows lightweight.
      recipientIds.length
        ? supabase
            .from('notifications')
            .select('user_id')
            .in('user_id', recipientIds)
            .eq('is_read', false)
            .eq('is_visible', true)
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const preferencesByUser = new Map<string, NotificationPreferences>();
    for (const userId of recipientIds) {
      const raw = (preferenceRows || []).find(row => row.user_id === userId);
      preferencesByUser.set(userId, mergePreferences(userId, raw || undefined));
    }

    // Per-recipient unread count → OS badge number for push payloads.
    const unreadByUser = new Map<string, number>();
    for (const row of (unreadRows || []) as Array<{ user_id: string }>) {
      unreadByUser.set(row.user_id, (unreadByUser.get(row.user_id) || 0) + 1);
    }

    const tripById = new Map<string, TripRow>(
      ((tripRows || []) as TripRow[]).map(row => [row.id, row]),
    );
    const profileByUserId = new Map<string, ProfileRow>(
      ((profileRows || []) as ProfileRow[]).map(row => [row.user_id, row]),
    );

    const pushTokensByUser = new Map<string, string[]>();
    for (const tokenRow of pushTokenRows || []) {
      const list = pushTokensByUser.get(tokenRow.user_id) || [];
      list.push(tokenRow.token);
      pushTokensByUser.set(tokenRow.user_id, list);
    }

    const webPushByUser = new Map<string, WebPushSubscription[]>();
    for (const subRow of (webPushRows || []) as WebPushSubscription[]) {
      const list = webPushByUser.get(subRow.user_id) || [];
      list.push(subRow);
      webPushByUser.set(subRow.user_id, list);
    }

    const summary = {
      processed: 0,
      sent: { push: 0, email: 0 },
      failed: { push: 0, email: 0 },
      skipped: { push: 0, email: 0 },
      deferred: 0,
    };

    for (const delivery of deliveries) {
      const notification = notificationById.get(delivery.notification_id);
      if (!notification) {
        await markDelivery(supabase, delivery.id, {
          status: 'failed',
          error: 'Missing notification row',
          attempts: delivery.attempts + 1,
        });
        summary.processed++;
        summary.failed[delivery.channel]++;
        continue;
      }

      const userId = notification.user_id;
      const prefs = preferencesByUser.get(userId) || mergePreferences(userId);
      const metadata = parseMetadata(notification.metadata);
      const category = normalizeCategory(notification.type || '');
      const channel = delivery.channel;

      summary.processed++;

      // Defensive: push + email are the only supported channels. A non-push/email
      // delivery (e.g. a historical channel='sms' row queued before the SMS-removal
      // migration marked it skipped) is claimed as 'processing' by the RPC; mark it
      // skipped here so it never gets stuck or double-counted in the summary.
      if ((channel as string) !== 'push' && (channel as string) !== 'email') {
        await markDelivery(supabase, delivery.id, {
          status: 'skipped',
          error: `unsupported_channel:${String(channel)}`,
          attempts: delivery.attempts + 1,
        });
        continue;
      }

      const basePreferenceDecision = enforcePreferenceAtSendTime(channel, category, prefs);
      if (!basePreferenceDecision.allow && basePreferenceDecision.reason === 'category_disabled') {
        await markDelivery(supabase, delivery.id, {
          status: 'skipped',
          error: `category_disabled:${category || 'unknown'}`,
          attempts: delivery.attempts + 1,
        });
        summary.skipped[channel]++;
        await logDeliveryAttempt(supabase, {
          userId,
          channel,
          title: notification.title,
          body: notification.message,
          status: 'skipped',
          error: `Category '${category || 'unknown'}' disabled`,
        });
        continue;
      }

      if (body.dryRun) {
        continue;
      }

      if (channel === 'push') {
        if (!basePreferenceDecision.allow) {
          await markDelivery(supabase, delivery.id, {
            status: 'skipped',
            error: 'push_disabled',
            attempts: delivery.attempts + 1,
          });
          summary.skipped.push++;
          continue;
        }

        const fcmTokens = pushTokensByUser.get(userId) || [];
        const webPushSubs = webPushByUser.get(userId) || [];

        if (fcmTokens.length === 0 && webPushSubs.length === 0) {
          await markDelivery(supabase, delivery.id, {
            status: 'skipped',
            error: 'no_push_targets',
            attempts: delivery.attempts + 1,
          });
          summary.skipped.push++;
          continue;
        }

        let pushSucceeded = false;
        let pushError = '';
        const providerIds: string[] = [];

        // OS app-icon badge count: this recipient's current unread total (already
        // includes the notification being delivered). Falls back to 1.
        const badgeCount = unreadByUser.get(userId) ?? 1;

        // 1. Deliver to FCM if available
        if (fcmTokens.length > 0) {
          const pushResult = await sendPush(fcmTokens, notification.title, notification.message, {
            notificationId: notification.id,
            type: notification.type || 'notification',
            tripId: notification.trip_id,
            badgeCount,
          });
          if (pushResult.ok) {
            pushSucceeded = true;
            if (pushResult.providerMessageId)
              providerIds.push(`fcm:${pushResult.providerMessageId}`);
          } else {
            pushError = `fcm_failed:${pushResult.error}`;
          }
        }

        // 2. Deliver to Web Push if available
        if (webPushSubs.length > 0 && vapidPublicKey && vapidPrivateKey) {
          for (const sub of webPushSubs) {
            const webResult = await sendWebPushNotification(
              sub,
              {
                title: notification.title,
                body: notification.message,
                tag: `notif-${notification.id}`,
                data: {
                  notificationId: notification.id,
                  tripId: notification.trip_id,
                  type: notification.type,
                  badgeCount,
                },
              },
              vapidPublicKey,
              vapidPrivateKey,
              vapidSubject,
            );
            if (webResult.success) {
              pushSucceeded = true;
              providerIds.push(`web:${sub.id}`);

              // Update last_used_at
              await supabase
                .from('web_push_subscriptions')
                .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
                .eq('id', sub.id);
            } else {
              if (!pushSucceeded)
                pushError = (pushError ? pushError + '; ' : '') + `web_failed:${webResult.error}`;

              // Increment failure count
              await supabase.rpc('mark_web_push_subscription_failed', {
                subscription_id: sub.id,
                error_message: webResult.error,
              });
            }
          }
        }

        if (pushSucceeded) {
          await markDelivery(supabase, delivery.id, {
            status: 'sent',
            provider_message_id: providerIds.join(','),
            error: null,
            sent_at: new Date().toISOString(),
            attempts: delivery.attempts + 1,
          });
          summary.sent.push++;
          await logDeliveryAttempt(supabase, {
            userId,
            channel: 'push',
            title: notification.title,
            body: notification.message,
            status: 'sent',
            externalId: providerIds.join(','),
          });
        } else {
          await markDelivery(supabase, delivery.id, {
            status: 'failed',
            error: pushError || 'push_delivery_failed',
            attempts: delivery.attempts + 1,
          });
          summary.failed.push++;
          await logDeliveryAttempt(supabase, {
            userId,
            channel: 'push',
            title: notification.title,
            body: notification.message,
            status: 'failed',
            error: pushError,
          });
        }

        continue;
      }

      if (channel === 'email') {
        if (!basePreferenceDecision.allow) {
          await markDelivery(supabase, delivery.id, {
            status: 'skipped',
            error: 'email_disabled',
            attempts: delivery.attempts + 1,
          });
          summary.skipped.email++;
          continue;
        }

        const recipientEmail = profileByUserId.get(userId)?.email?.trim();
        if (!recipientEmail) {
          await markDelivery(supabase, delivery.id, {
            status: 'skipped',
            error: 'missing_email',
            attempts: delivery.attempts + 1,
          });
          summary.skipped.email++;
          continue;
        }

        const emailMeta = parseMetadata(notification.metadata);
        const contentType = categoryToContentType(category, emailMeta);

        let emailSubject: string;
        let emailBody: string;

        if (contentType) {
          const emailTripCtx = buildTripContextFromRow(notification, tripById, emailMeta);
          const actorId = getActorUserId(emailMeta);
          const emailActorName =
            (typeof emailMeta.sender_name === 'string' && emailMeta.sender_name) ||
            (typeof emailMeta.requester_name === 'string' && emailMeta.requester_name) ||
            getDisplayName(actorId ? profileByUserId.get(actorId) : undefined);

          const emailContent = buildNotificationContent({
            type: contentType,
            channel: 'email',
            tripContext: emailTripCtx,
            actorName: emailActorName,
            count: typeof emailMeta.count === 'number' ? emailMeta.count : undefined,
            extra: { tripId: notification.trip_id || undefined },
          }) as EmailContent;

          emailSubject = emailContent.subject;
          emailBody = emailContent.bodyHtml;
        } else {
          emailSubject = notification.title;
          emailBody = notification.message;
        }

        const emailResult = await sendEmail(recipientEmail, emailSubject, emailBody);
        if (emailResult.ok) {
          await markDelivery(supabase, delivery.id, {
            status: 'sent',
            provider_message_id: emailResult.providerMessageId || null,
            error: null,
            sent_at: new Date().toISOString(),
            attempts: delivery.attempts + 1,
          });
          summary.sent.email++;
          await logDeliveryAttempt(supabase, {
            userId,
            channel: 'email',
            title: notification.title,
            body: notification.message,
            recipient: recipientEmail,
            status: 'sent',
            externalId: emailResult.providerMessageId,
          });
        } else {
          await markDelivery(supabase, delivery.id, {
            status: 'failed',
            error: emailResult.error || 'email_delivery_failed',
            attempts: delivery.attempts + 1,
          });
          summary.failed.email++;
          await logDeliveryAttempt(supabase, {
            userId,
            channel: 'email',
            title: notification.title,
            body: notification.message,
            recipient: recipientEmail,
            status: 'failed',
            error: emailResult.error,
          });
        }

        continue;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: deliveries.length,
        ...summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[dispatch-notification-deliveries] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
