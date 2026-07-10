import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireSecrets } from '../_shared/validateSecrets.ts';
import {
  USER_ENTITLEMENT_CONFLICT_TARGET,
  resolvePurchaseTypeForProductId,
  type RevenueCatPurchaseType,
} from '../_shared/entitlementUpsert.ts';
import {
  SUBSCRIPTION_EVENTS,
  deriveEntitlementFromEvent,
  isStaleExpiration,
  revenueCatIdempotencyKey,
  type RevenueCatEvent,
} from './eventState.ts';

interface RevenueCatWebhookPayload {
  event: RevenueCatEvent;
  api_version: string;
}

/**
 * Constant-time comparison of the shared webhook secret to avoid leaking it via a
 * timing side-channel (CWE-208). RevenueCat authenticates webhooks with a verbatim
 * Authorization header (no body HMAC), so a timing-safe compare is the correct
 * hardening here. Runs O(len(expected)) work regardless of length mismatch.
 */
function timingSafeEqualStr(received: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(received);
  const b = enc.encode(expected);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < b.length; i++) {
    mismatch |= (a[i] ?? 0) ^ b[i];
  }
  return mismatch === 0;
}

serve(async req => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Validate secrets at startup
  const { REVENUECAT_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireSecrets([
    'REVENUECAT_WEBHOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);

  // RevenueCat authentication: dashboard-configured Authorization header sent verbatim.
  // Docs: https://www.revenuecat.com/docs/integrations/webhooks/overview#security
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !timingSafeEqualStr(authHeader, REVENUECAT_WEBHOOK_SECRET)) {
    console.error('[rc-webhook] Invalid or missing Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const rawBody = await req.text();

  let payload: RevenueCatWebhookPayload;
  try {
    const parsed = JSON.parse(rawBody);
    // Guard: ensure top-level event object exists before destructuring
    if (!parsed || typeof parsed !== 'object' || !parsed.event || !parsed.event.type) {
      return new Response(JSON.stringify({ error: 'Invalid payload: missing event' }), {
        status: 400,
      });
    }
    payload = parsed as RevenueCatWebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { event } = payload;

  // Skip events that don't affect subscription state
  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    console.log(`[rc-webhook] Skipping non-subscription event: ${event.type}`);
    return new Response(JSON.stringify({ success: true, skipped: true }), { status: 200 });
  }

  // Use original_app_user_id (Supabase user UUID) as the authoritative user ID
  const userId = event.original_app_user_id || event.app_user_id;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    console.warn(`[rc-webhook] Non-UUID app_user_id: ${userId} — skipping`);
    return new Response(JSON.stringify({ success: true, skipped: true, reason: 'non_uuid_user' }), {
      status: 200,
    });
  }

  console.log(`[rc-webhook] Processing ${event.type} for user: ${userId}`);

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Atomic idempotency: insert the event id into the shared webhook_events table.
  // A unique-constraint violation (23505) means RevenueCat re-delivered an event we
  // already processed (retry/storm) — skip it. The key is `rc_`-prefixed so it can
  // never collide with Stripe's `evt_*` ids in the same table.
  const idempotencyKey = revenueCatIdempotencyKey(event);
  const { error: idempotencyError } = await serviceClient.from('webhook_events').insert({
    event_id: idempotencyKey,
    event_type: event.type,
    processed_at: new Date().toISOString(),
  });

  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      console.log(`[rc-webhook] Duplicate event skipped (idempotency): ${idempotencyKey}`);
      return new Response(JSON.stringify({ success: true, duplicate: true }), { status: 200 });
    }
    // Any other DB error — log and continue (don't silently drop real events).
    console.warn('[rc-webhook] Idempotency insert failed:', idempotencyError.message);
  }

  const releaseIdempotency = async () => {
    // On processing failure we remove the marker so RevenueCat's retry can reprocess.
    await serviceClient.from('webhook_events').delete().eq('event_id', idempotencyKey);
  };

  const { plan, status, currentPeriodEnd } = deriveEntitlementFromEvent(event);
  const purchaseType: RevenueCatPurchaseType = resolvePurchaseTypeForProductId(event.product_id);

  // Read the current entitlement once: used for both the reorder guard and the
  // no-op content-diff check.
  const { data: existing } = await serviceClient
    .from('user_entitlements')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .eq('source', 'revenuecat')
    .eq('purchase_type', purchaseType)
    .maybeSingle();

  // Reorder guard: a late/replayed EXPIRATION must not revoke access that a newer
  // RENEWAL already extended into the future.
  if (isStaleExpiration(event, existing?.current_period_end ?? null, new Date().toISOString())) {
    console.log(`[rc-webhook] Stale EXPIRATION for user ${userId} — access still valid, skipping`);
    return new Response(JSON.stringify({ success: true, synced: false, reason: 'stale_event' }), {
      status: 200,
    });
  }

  const normalizedPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null;
  const existingPeriodEnd = existing?.current_period_end
    ? new Date(existing.current_period_end).toISOString()
    : null;

  if (
    existing &&
    existing.plan === plan &&
    existing.status === status &&
    existingPeriodEnd === normalizedPeriodEnd
  ) {
    console.log(`[rc-webhook] No change for user ${userId} — skipping DB write`);
    return new Response(JSON.stringify({ success: true, synced: false, reason: 'no_change' }), {
      status: 200,
    });
  }

  const { error: upsertError } = await serviceClient.from('user_entitlements').upsert(
    {
      user_id: userId,
      source: 'revenuecat',
      plan,
      status,
      purchase_type: purchaseType,
      current_period_end: currentPeriodEnd,
      entitlements: event.entitlement_ids || [],
      revenuecat_customer_id: event.app_user_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
  );

  if (upsertError) {
    console.error(`[rc-webhook] Upsert error for user ${userId}:`, upsertError);
    await releaseIdempotency();
    // Return 500 so RevenueCat retries
    return new Response(JSON.stringify({ error: 'Database update failed' }), { status: 500 });
  }

  console.log(`[rc-webhook] Synced user ${userId}: plan=${plan}, status=${status}`);

  return new Response(JSON.stringify({ success: true, synced: true, plan, status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
