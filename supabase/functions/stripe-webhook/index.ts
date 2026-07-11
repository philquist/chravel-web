/**
 * Stripe Webhook Handler
 *
 * Processes Stripe webhook events to sync subscription status with database.
 *
 * HARDENING (2026-03-15):
 * - Fix 3: Payment failure keeps plan with 'past_due' status (grace period)
 * - Fix 4: Trip Pass and subscription upserts use purchase_type-scoped conflict
 * - Fix 5: Cancellation respects current_period_end (access until expiry)
 * - Fix 8: Idempotency check is mandatory (not best-effort)
 * - Fix 10: All entitlement changes logged to entitlement_audit_log
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import {
  createSecureResponse,
  createErrorResponse,
  createOptionsResponse,
} from '../_shared/securityHeaders.ts';
import { sanitizeErrorForClient, logError } from '../_shared/errorHandling.ts';
import { USER_ENTITLEMENT_CONFLICT_TARGET } from '../_shared/entitlementUpsert.ts';

const sanitizeDetails = (obj: unknown): unknown => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeDetails);
  }

  const sensitiveKeys = [
    'email',
    'phone',
    'name',
    'line1',
    'line2',
    'city',
    'state',
    'postal_code',
    'card',
    'bank_account',
  ];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKeys.includes(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const logStep = (step: string, details?: unknown) => {
  const sanitized = details ? sanitizeDetails(details) : undefined;
  const detailsStr = sanitized ? ` - ${JSON.stringify(sanitized)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// ============================================================
// PRODUCT IDS - ChravelApp Stripe Products
// ============================================================
const PRODUCT_TO_TIER: Record<string, string> = {
  // Consumer Plans - ChravelApp Plus (monthly + annual are separate products)
  prod_U73VxEnvEHbBrx: 'explorer', // Explorer monthly
  prod_U73VrTc4sE8AIv: 'explorer', // Explorer annual
  prod_U73VfiKf3VrJKf: 'frequent-chraveler', // FC monthly
  prod_U73VqblRTSr2XZ: 'frequent-chraveler', // FC annual

  // Pro Plans - ChravelApp Pro
  prod_U73Vlcl4lqgsb4: 'pro-starter',
  prod_U73VPX6TlClQ7J: 'pro-growth',
  prod_U73Vd6QW4pEY9x: 'pro-enterprise',

  // Trip Pass Products (one-time)
  prod_U73WaALe9yjrAR: 'explorer',
  prod_U73W99ebeJvbLB: 'frequent-chraveler',
};

import {
  mapStripeStatusToEntitlementStatus,
  normalizeSeatCount,
  resolveCanceledTransition,
  resolveEntitlementTransition,
} from './entitlementTransitions.ts';
import {
  extractRefundedPurchaseType,
  resolvePaymentIntentId,
  shouldRevokeTripPassOnRefund,
} from './refundCorrelation.ts';

/**
 * Log an entitlement change to the audit trail (best-effort — does not block).
 */
async function logEntitlementChange(
  supabase: any,
  params: {
    userId: string;
    oldPlan?: string;
    newPlan: string;
    oldStatus?: string;
    newStatus: string;
    source: string;
    eventId: string;
    eventType: string;
    purchaseType: string;
    reason?: string;
  },
): Promise<void> {
  try {
    await supabase.from('entitlement_audit_log').insert({
      user_id: params.userId,
      old_plan: params.oldPlan || null,
      new_plan: params.newPlan,
      old_status: params.oldStatus || null,
      new_status: params.newStatus,
      source: params.source,
      event_id: params.eventId,
      event_type: params.eventType,
      purchase_type: params.purchaseType,
      reason: params.reason || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Audit logging is best-effort — never block webhook processing
    console.warn('[STRIPE-WEBHOOK] Audit log insert failed:', err);
  }
}

/**
 * Read the current entitlement for a user + purchase_type, for audit trail.
 */
async function getCurrentEntitlement(
  supabase: any,
  userId: string,
  purchaseType: string,
): Promise<{ plan: string; status: string } | null> {
  const { data } = await supabase
    .from('user_entitlements')
    .select('plan, status')
    .eq('user_id', userId)
    .eq('purchase_type', purchaseType)
    .maybeSingle();
  return data || null;
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return createOptionsResponse(req);
  }

  try {
    logStep('Webhook received');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!stripeKey || !webhookSecret) {
      logError('STRIPE_WEBHOOK', new Error('Missing Stripe configuration'));
      return createErrorResponse('Service configuration error', 500);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify webhook signature
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      logError('STRIPE_WEBHOOK', new Error('No signature header'));
      return createErrorResponse('Missing signature', 400);
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep('Webhook verified', { type: event.type, id: event.id });
    } catch (err) {
      logError('STRIPE_WEBHOOK', err);
      await upsertWebhookFailure(supabaseClient, {
        eventId: 'signature-verification-failed',
        eventType: 'signature_verification',
        failureStage: 'signature_verification',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return createErrorResponse('Invalid signature', 400);
    }

    // Atomic idempotency: plain INSERT that relies on the unique constraint on event_id.
    // ON CONFLICT DO NOTHING via ignoreDuplicates:true is unreliable — PostgREST may
    // return an empty array for *both* first inserts and duplicates, making them
    // indistinguishable. Instead, we INSERT without conflict suppression and treat
    // a unique-constraint violation (Postgres error code 23505) as a duplicate signal.
    const { error: idempotencyError } = await supabaseClient.from('webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    });

    if (idempotencyError) {
      if (idempotencyError.code === '23505') {
        // Unique constraint violation = event already processed
        logStep('Duplicate event skipped (idempotency)', { eventId: event.id });
        await resolveWebhookFailure(supabaseClient, event.id);
        return createSecureResponse({ received: true, duplicate: true, eventType: event.type });
      }
      // Any other DB error — fail CLOSED. Processing without a durable idempotency
      // marker means a concurrent redelivery could double-apply the billing change.
      // Record the failure and return 500 so Stripe retries; a retried event is safe,
      // a double-processed billing event is not.
      console.error(
        '[STRIPE-WEBHOOK] Idempotency insert failed — failing closed:',
        idempotencyError.message,
      );
      await upsertWebhookFailure(supabaseClient, {
        eventId: event.id,
        eventType: event.type,
        failureStage: 'idempotency_insert',
        errorMessage: idempotencyError.message,
      });
      return createSecureResponse({ error: 'Idempotency check unavailable, retry' }, 500);
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          supabaseClient,
          stripe,
          event.id,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          supabaseClient,
          event.id,
          event.type,
        );
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          supabaseClient,
          event.id,
        );
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, supabaseClient);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          supabaseClient,
          event.id,
        );
        break;

      case 'charge.refunded':
        await handleChargeRefunded(
          event.data.object as Stripe.Charge,
          supabaseClient,
          stripe,
          event.id,
        );
        break;

      default:
        logStep('Unhandled event type', { type: event.type });
    }

    await resolveWebhookFailure(supabaseClient, event.id);
    return createSecureResponse({ received: true, eventType: event.type });
  } catch (error) {
    logError('STRIPE_WEBHOOK', error);
    return createErrorResponse(sanitizeErrorForClient(error), 500);
  }
});

async function upsertWebhookFailure(
  supabase: any,
  params: { eventId: string; eventType: string; failureStage: string; errorMessage: string },
) {
  await supabase.from('billing_webhook_processing_failures').upsert(
    {
      provider: 'stripe',
      event_id: params.eventId,
      event_type: params.eventType,
      failure_stage: params.failureStage,
      error_message: params.errorMessage,
      last_seen_at: new Date().toISOString(),
      retry_count: 1,
      resolved_at: null,
    },
    { onConflict: 'provider,event_id', ignoreDuplicates: false },
  );
}

async function resolveWebhookFailure(supabase: any, eventId: string) {
  await supabase
    .from('billing_webhook_processing_failures')
    .update({ resolved_at: new Date().toISOString() })
    .eq('provider', 'stripe')
    .eq('event_id', eventId);
}
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: any,
  stripe: Stripe,
  eventId: string,
) {
  logStep('Processing checkout.session.completed', { sessionId: session.id });

  const userId = session.metadata?.user_id;
  const customerId = session.customer as string;
  const purchaseType = session.metadata?.purchase_type || 'subscription';

  if (!userId) {
    logStep('No user_id in session metadata');
    return;
  }

  // Link the Stripe customer to the user on their profile (keyed by user_id).
  // NOTE: the `private_profiles` PII-separation table is not deployed; billing
  // identifiers live on `profiles`. See docs/ACTIVE/PAYMENTS_AUDIT.md.
  await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('user_id', userId);

  // Handle Trip Pass purchase
  if (purchaseType === 'pass') {
    const tier = session.metadata?.tier || 'explorer';
    const durationDays = parseInt(session.metadata?.duration_days || '45', 10);

    logStep('Processing Trip Pass purchase', { userId, tier, durationDays });

    // Read current entitlement for audit trail
    const currentEnt = await getCurrentEntitlement(supabase, userId, 'pass');

    // Check for existing active pass to extend
    const { data: existing } = await supabase
      .from('user_entitlements')
      .select('current_period_end')
      .eq('user_id', userId)
      .eq('purchase_type', 'pass')
      .eq('status', 'active')
      .eq('plan', tier)
      .maybeSingle();

    const now = new Date();
    const baseDate =
      existing?.current_period_end && new Date(existing.current_period_end) > now
        ? new Date(existing.current_period_end)
        : now;
    const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // FIX 4: Upsert scoped to purchase_type to prevent overwriting subscriptions
    await supabase.from('user_entitlements').upsert(
      {
        user_id: userId,
        plan: tier,
        status: 'active',
        source: 'stripe',
        purchase_type: 'pass',
        current_period_end: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
    );

    // FIX 10: Audit log
    await logEntitlementChange(supabase, {
      userId,
      oldPlan: currentEnt?.plan,
      newPlan: tier,
      oldStatus: currentEnt?.status,
      newStatus: 'active',
      source: 'stripe',
      eventId,
      eventType: 'checkout.session.completed',
      purchaseType: 'pass',
      reason: `Trip Pass purchased (${durationDays} days)`,
    });

    // Notify user
    const tierName = tier === 'explorer' ? 'Explorer' : 'Frequent Chraveler';
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'subscription',
      title: '🎫 Trip Pass Activated!',
      message: `Your ${tierName} Trip Pass is active for ${durationDays} days — enjoy full premium access until ${expiresAt.toLocaleDateString()}.`,
      metadata: { tier, purchase_type: 'pass', expires_at: expiresAt.toISOString() },
    });

    logStep('Trip Pass granted', { userId, tier, expiresAt: expiresAt.toISOString() });
  } else {
    logStep('Checkout completed (subscription), customer linked', { userId, customerId });
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: any,
  eventId: string,
  eventType: string,
) {
  logStep('Processing subscription update', { id: subscription.id, status: subscription.status });

  const customerId = subscription.customer as string;
  const firstItem = subscription.items.data[0];
  const productId = firstItem?.price.product as string;
  const seatCount = normalizeSeatCount(firstItem?.quantity);
  const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
  const tier = PRODUCT_TO_TIER[productId] || 'free';

  // Find user by customer ID (billing identifiers live on `profiles`, keyed by user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (!profiles || profiles.length === 0) {
    logStep('Customer not found in profiles', { customerId });
    return;
  }

  const userId = profiles[0].user_id;

  // Read current entitlement for audit trail
  const currentEnt = await getCurrentEntitlement(supabase, userId, 'subscription');

  // Persist the subscription id on the profile
  await supabase
    .from('profiles')
    .update({
      stripe_subscription_id: subscription.id,
    })
    .eq('user_id', userId);

  // Update public profile with subscription status
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      subscription_product_id: productId,
      subscription_status: subscription.status,
      subscription_end: subscriptionEnd,
    })
    .eq('user_id', userId);

  if (profileError) {
    logError('STRIPE_WEBHOOK', profileError);
    return;
  }

  const transition = resolveEntitlementTransition({
    stripeStatus: subscription.status,
    mappedTier: tier,
    subscriptionPeriodEndIso: subscriptionEnd,
    nowIso: new Date().toISOString(),
  });

  // FIX 4: Upsert scoped to subscription purchase_type
  const { error: entitlementsError } = await supabase.from('user_entitlements').upsert(
    {
      user_id: userId,
      source: 'stripe',
      plan: transition.plan,
      status: transition.status,
      purchase_type: 'subscription',
      current_period_end: transition.currentPeriodEnd,
      entitlements: { seats: seatCount },
      updated_at: new Date().toISOString(),
    },
    { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
  );

  if (entitlementsError) {
    logError('STRIPE_WEBHOOK', entitlementsError);
  }

  // FIX 10: Audit log
  await logEntitlementChange(supabase, {
    userId,
    oldPlan: currentEnt?.plan,
    newPlan: transition.plan,
    oldStatus: currentEnt?.status,
    newStatus: transition.status,
    source: 'stripe',
    eventId,
    eventType,
    purchaseType: 'subscription',
    reason: `Subscription ${subscription.status} (product: ${productId})`,
  });

  // Create notification for user
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'subscription',
    title: getNotificationTitle(subscription.status),
    message: getNotificationMessage(subscription.status, tier, subscriptionEnd),
    metadata: {
      subscription_id: subscription.id,
      product_id: productId,
      tier: tier,
      status: subscription.status,
    },
  });

  logStep('Subscription updated', {
    userId,
    tier,
    status: subscription.status,
    entitlementStatus: transition.status,
    entitlementPlan: transition.plan,
    seatCount,
  });

  if (tier.startsWith('pro-')) {
    await syncOrganizationSeatLimitsFromProSubscription(supabase, {
      userId,
      tier,
      customerId,
      subscriptionId: subscription.id,
    });
  }
}

const PRO_TIER_SEAT_LIMITS: Record<string, number> = {
  'pro-starter': 50,
  'pro-growth': 100,
  'pro-enterprise': 250,
};

async function syncOrganizationSeatLimitsFromProSubscription(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    tier: string;
    customerId: string;
    subscriptionId: string;
  },
): Promise<void> {
  const seatLimit = PRO_TIER_SEAT_LIMITS[params.tier];
  if (!seatLimit) return;

  const orgIds = new Set<string>();

  const { data: billingRows } = await supabase
    .from('organization_billing')
    .select('organization_id')
    .or(
      `stripe_customer_id.eq.${params.customerId},stripe_subscription_id.eq.${params.subscriptionId}`,
    );

  billingRows?.forEach((row: { organization_id: string }) => orgIds.add(row.organization_id));

  const { data: subscriptionLinks } = await supabase
    .from('organization_subscription_links')
    .select('organization_id')
    .eq('provider_subscription_id', params.subscriptionId);

  subscriptionLinks?.forEach((row: { organization_id: string }) => orgIds.add(row.organization_id));

  const { data: ownedOrgs } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', params.userId)
    .eq('role', 'owner');

  ownedOrgs?.forEach((row: { organization_id: string }) => orgIds.add(row.organization_id));

  for (const organizationId of orgIds) {
    const { data: orgRow, error: readError } = await supabase
      .from('organizations')
      .select('seats_used')
      .eq('id', organizationId)
      .maybeSingle();

    if (readError || !orgRow) {
      logStep('Org seat_limit sync skipped — org not found', { organizationId, readError });
      continue;
    }

    if (orgRow.seats_used > seatLimit) {
      logStep('Org seat_limit sync skipped — seats_used exceeds plan limit', {
        organizationId,
        seatsUsed: orgRow.seats_used,
        seatLimit,
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from('organizations')
      .update({ seat_limit: seatLimit, updated_at: new Date().toISOString() })
      .eq('id', organizationId);

    if (updateError) {
      logError('STRIPE_WEBHOOK', updateError);
      logStep('Failed to sync organization seat_limit', { organizationId, seatLimit });
      continue;
    }

    logStep('Synced organization seat_limit from Pro subscription', {
      organizationId,
      seatLimit,
      tier: params.tier,
    });
  }
}

function getNotificationTitle(status: string): string {
  switch (status) {
    case 'active':
      return '✅ Subscription Activated';
    case 'past_due':
      return '⚠️ Payment Issue';
    case 'canceled':
      return 'Subscription Canceled';
    case 'trialing':
      return '🎉 Trial Started';
    default:
      return 'Subscription Updated';
  }
}

function getNotificationMessage(status: string, tier: string, subscriptionEnd: string): string {
  const endDate = new Date(subscriptionEnd).toLocaleDateString();
  const tierName =
    tier === 'explorer'
      ? 'Explorer'
      : tier === 'frequent-chraveler'
        ? 'Frequent Chraveler'
        : tier.replace('pro-', 'Pro ');

  switch (status) {
    case 'active':
      return `Your ${tierName} subscription is now active until ${endDate}.`;
    case 'past_due':
      return 'We had trouble processing your payment. Please update your payment method to avoid losing access.';
    case 'canceled':
      return `Your subscription has been canceled. You will retain access until ${endDate}.`;
    case 'trialing':
      return `Your free trial is active until ${endDate}. Enjoy full access!`;
    default:
      return 'Your subscription status has been updated.';
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: any,
  eventId: string,
) {
  logStep('Processing subscription deletion', { id: subscription.id });

  const customerId = subscription.customer as string;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (!profiles || profiles.length === 0) {
    logStep('Customer not found', { customerId });
    return;
  }

  const userId = profiles[0].user_id;

  // Read current entitlement for audit trail
  const currentEnt = await getCurrentEntitlement(supabase, userId, 'subscription');

  await supabase
    .from('profiles')
    .update({
      stripe_subscription_id: null,
    })
    .eq('user_id', userId);

  // FIX 5: Keep the subscription_end so we know when access actually expires.
  // The period end is honored: if it's in the future the user keeps access until
  // then (a cron or next check-subscription call downgrades on expiry).
  const productId = subscription.items.data[0]?.price.product as string;
  const tier = PRODUCT_TO_TIER[productId] || 'free';
  const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
  const canceledTransition = resolveCanceledTransition({
    mappedTier: tier,
    subscriptionPeriodEndIso: subscriptionEnd,
    nowIso: new Date().toISOString(),
  });

  await supabase
    .from('profiles')
    .update({
      subscription_product_id: null,
      subscription_status: 'canceled',
      subscription_end: subscriptionEnd,
    })
    .eq('user_id', userId);

  if (canceledTransition.plan !== 'free') {
    await supabase.from('user_entitlements').upsert(
      {
        user_id: userId,
        source: 'stripe',
        plan: canceledTransition.plan,
        status: canceledTransition.status,
        purchase_type: 'subscription',
        current_period_end: canceledTransition.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
    );
    logStep('Subscription canceled — access retained until period end', {
      userId,
      tier,
      periodEnd: subscriptionEnd,
    });
  } else {
    await supabase.from('user_entitlements').upsert(
      {
        user_id: userId,
        source: 'stripe',
        plan: canceledTransition.plan,
        status: canceledTransition.status,
        purchase_type: 'subscription',
        current_period_end: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
    );
    logStep('Subscription deleted — period expired, downgraded to free', { userId });
  }

  // FIX 10: Audit log
  await logEntitlementChange(supabase, {
    userId,
    oldPlan: currentEnt?.plan,
    newPlan: canceledTransition.plan,
    oldStatus: currentEnt?.status,
    newStatus: 'canceled',
    source: 'stripe',
    eventId,
    eventType: 'customer.subscription.deleted',
    purchaseType: 'subscription',
    reason:
      canceledTransition.plan !== 'free'
        ? `Canceled — access until ${subscriptionEnd}`
        : 'Canceled — period expired',
  });

  // Notify the user
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'subscription',
    title: 'Subscription Canceled',
    message:
      canceledTransition.plan !== 'free'
        ? `Your subscription has been canceled. You'll retain full access until ${new Date(subscriptionEnd).toLocaleDateString()}.`
        : 'Your subscription has ended. Upgrade anytime to restore premium features.',
    metadata: { subscription_id: subscription.id, period_end: subscriptionEnd },
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
  logStep('Payment succeeded', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid / 100,
    currency: invoice.currency,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, supabase: any, eventId: string) {
  logStep('Processing failed payment', { id: invoice.id });

  const customerId = invoice.customer as string;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (!profiles || profiles.length === 0) return;

  const userId = profiles[0].user_id;

  // Read current entitlement for audit trail
  const currentEnt = await getCurrentEntitlement(supabase, userId, 'subscription');

  // FIX 3: On payment failure, mark status as past_due but KEEP the current plan.
  // Stripe will retry the payment according to its dunning settings.
  // The user retains access during the grace/retry period.
  await supabase.from('profiles').update({ subscription_status: 'past_due' }).eq('user_id', userId);

  await supabase
    .from('user_entitlements')
    .update({
      status: 'past_due',
      // Keep plan and current_period_end unchanged — user retains access
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .eq('purchase_type', 'subscription');

  // FIX 10: Audit log
  await logEntitlementChange(supabase, {
    userId,
    oldPlan: currentEnt?.plan,
    newPlan: currentEnt?.plan || 'unknown',
    oldStatus: currentEnt?.status,
    newStatus: 'past_due',
    source: 'stripe',
    eventId,
    eventType: 'invoice.payment_failed',
    purchaseType: 'subscription',
    reason: `Payment failed (invoice: ${invoice.id}) — grace period, plan retained`,
  });

  // Notify user of payment failure
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'payment',
    title: '⚠️ Payment Failed',
    message:
      'We had trouble processing your subscription payment. Please update your payment method to avoid losing access.',
    metadata: { invoice_id: invoice.id },
  });

  logStep('Payment failure recorded — plan retained with past_due status', { userId });
}

async function handleChargeRefunded(
  charge: Stripe.Charge,
  supabase: any,
  stripe: Stripe,
  eventId: string,
) {
  logStep('Processing charge refund', { chargeId: charge.id });

  const customerId = charge.customer as string;
  if (!customerId) {
    logStep('No customer on refunded charge');
    return;
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (!profiles || profiles.length === 0) {
    logStep('Customer not found for refund', { customerId });
    return;
  }

  const userId = profiles[0].user_id;

  // Only a refund of the *Trip Pass purchase itself* should revoke a pass.
  // Trip Passes are bought via a one-time Checkout Session (mode: 'payment') whose
  // metadata carries purchase_type='pass'; that metadata does NOT propagate to the
  // Charge. So correlate the refunded charge back to its originating Checkout Session
  // via the PaymentIntent. If the refund is for a subscription (or any other) charge
  // on the same customer, leave the pass intact and let the subscription flows handle it.
  const paymentIntentId = resolvePaymentIntentId(charge.payment_intent);

  let refundedPurchaseType: string | null = null;
  if (paymentIntentId) {
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      });
      refundedPurchaseType = extractRefundedPurchaseType(sessions.data[0]);
    } catch (err) {
      logStep('Could not resolve checkout session for refunded charge', {
        paymentIntentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!shouldRevokeTripPassOnRefund(refundedPurchaseType)) {
    logStep('Refund is not a Trip Pass purchase — pass entitlement left intact', {
      userId,
      refundedPurchaseType,
    });
    return;
  }

  // Confirmed: the refunded charge was a Trip Pass purchase. Expire the active pass.
  const { data: passEntitlement } = await supabase
    .from('user_entitlements')
    .select('purchase_type, plan, status')
    .eq('user_id', userId)
    .eq('purchase_type', 'pass')
    .eq('status', 'active')
    .maybeSingle();

  if (passEntitlement) {
    await supabase
      .from('user_entitlements')
      .update({
        status: 'expired',
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('purchase_type', 'pass');

    // FIX 10: Audit log
    await logEntitlementChange(supabase, {
      userId,
      oldPlan: passEntitlement.plan,
      newPlan: passEntitlement.plan,
      oldStatus: passEntitlement.status,
      newStatus: 'expired',
      source: 'stripe',
      eventId,
      eventType: 'charge.refunded',
      purchaseType: 'pass',
      reason: `Trip Pass refunded (charge: ${charge.id})`,
    });

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'subscription',
      title: '🔄 Trip Pass Refunded',
      message: 'Your Trip Pass has been refunded and access has been revoked.',
      metadata: { action: 'pass_refunded' },
    });

    logStep('Trip Pass revoked due to refund', { userId });
  } else {
    logStep('Pass refund processed — no active pass entitlement to revoke', { userId });
  }
}
