/**
 * Stripe Subscription Checker
 *
 * Primary source of truth: user_entitlements (webhook-normalized state).
 * Stripe API is used only as reconciliation fallback when entitlements are missing/stale.
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
import {
  resolveEffectiveEntitlement,
  type EntitlementRow,
} from '../_shared/entitlementSelection.ts';
import { isSuperAdminEmail } from '../_shared/superAdmins.ts';
import {
  normalizeFromEntitlement,
  normalizeStripeStatus,
  shouldReconcileFromStripe,
  type NormalizedSubscriptionResponse,
} from './entitlementState.ts';

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// ============================================================
// PRODUCT IDS - UPDATE THESE AFTER CREATING PRODUCTS IN STRIPE
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

const pickBestStripeSubscription = (
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | null => {
  const nowMs = Date.now();

  const isStripeEffective = (sub: Stripe.Subscription) => {
    if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
      return true;
    }
    if (sub.status === 'canceled' && sub.current_period_end) {
      return sub.current_period_end * 1000 > nowMs;
    }
    return false;
  };

  const priority = (status: Stripe.Subscription.Status): number => {
    if (status === 'active') return 5;
    if (status === 'trialing') return 4;
    if (status === 'past_due') return 3;
    if (status === 'canceled') return 2;
    return 1;
  };

  const effective = subscriptions.filter(isStripeEffective).sort((a, b) => {
    const byPriority = priority(b.status) - priority(a.status);
    if (byPriority !== 0) return byPriority;
    return b.current_period_end - a.current_period_end;
  });

  if (effective.length > 0) return effective[0];

  const fallback = [...subscriptions].sort((a, b) => {
    const byPriority = priority(b.status) - priority(a.status);
    if (byPriority !== 0) return byPriority;
    return b.current_period_end - a.current_period_end;
  });

  return fallback[0] ?? null;
};

const normalizeFromStripeSubscription = (
  subscription: Stripe.Subscription | null,
): {
  response: NormalizedSubscriptionResponse;
  entitlementRow: {
    plan: string;
    status: string;
    current_period_end: string | null;
    purchase_type: 'subscription';
    source: 'stripe';
  };
} => {
  if (!subscription) {
    return {
      response: {
        subscribed: false,
        tier: 'free',
        product_id: null,
        subscription_end: null,
        purchase_type: 'subscription',
        status: 'expired',
        current_period_end: null,
      },
      entitlementRow: {
        plan: 'free',
        status: 'expired',
        current_period_end: null,
        purchase_type: 'subscription',
        source: 'stripe',
      },
    };
  }

  const productId = (subscription.items.data[0]?.price.product as string | undefined) ?? null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const status = normalizeStripeStatus(subscription.status);
  const tier = productId ? PRODUCT_TO_TIER[productId] || 'free' : 'free';
  const subscribed =
    tier !== 'free' && (status === 'active' || status === 'trialing' || status === 'past_due');

  return {
    response: {
      subscribed,
      tier: subscribed ? tier : 'free',
      product_id: productId,
      subscription_end: currentPeriodEnd,
      purchase_type: 'subscription',
      status,
      current_period_end: currentPeriodEnd,
    },
    entitlementRow: {
      plan: subscribed ? tier : 'free',
      status,
      current_period_end: currentPeriodEnd,
      purchase_type: 'subscription',
      source: 'stripe',
    },
  };
};

const syncProfileFromResponse = async (
  supabaseClient: any, // intentional: untyped client in Deno edge function
  userId: string,
  response: NormalizedSubscriptionResponse,
): Promise<void> => {
  if (response.subscribed && response.product_id) {
    await supabaseClient
      .from('profiles')
      .update({
        subscription_product_id: response.product_id,
        subscription_status: response.status,
        subscription_end: response.subscription_end,
      })
      .eq('user_id', userId);
    return;
  }

  await supabaseClient
    .from('profiles')
    .update({
      subscription_product_id: null,
      subscription_status: null,
      subscription_end: null,
    })
    .eq('user_id', userId);
};

serve(async req => {
  if (req.method === 'OPTIONS') {
    return createOptionsResponse(req);
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    logStep('Function started');
    const requestBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const requestReason =
      typeof requestBody?.reason === 'string' ? requestBody.reason : 'unspecified';

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return createErrorResponse('Service configuration error', 500);
    }
    logStep('Stripe key verified');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse('Authentication required', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }
    const user = userData.user;
    logStep('User authenticated', { userId: user.id });

    // Super admin bypass - return max tier without Stripe check
    if (isSuperAdminEmail(user.email)) {
      logStep('Super admin detected - bypassing Stripe check', { userId: user.id });
      return createSecureResponse({
        subscribed: true,
        status: 'active',
        tier: 'pro-enterprise',
        product_id: 'super_admin_bypass',
        subscription_end: null,
        is_super_admin: true,
        purchase_type: 'subscription',
        current_period_end: null,
      });
    }

    const { data: entitlementRows, error: entitlementError } = await supabaseClient
      .from('user_entitlements')
      .select('user_id, plan, status, current_period_end, purchase_type, updated_at')
      .eq('user_id', user.id)
      .in('purchase_type', ['subscription', 'pass'])
      .order('updated_at', { ascending: false });

    const typedRows = (entitlementRows ?? []) as EntitlementRow[];
    const { shouldReconcile, primary } = shouldReconcileFromStripe(typedRows, new Date());

    if (!shouldReconcile && !entitlementError) {
      const normalized = normalizeFromEntitlement(primary);
      logStep('Resolved subscription from user_entitlements (fresh)', {
        tier: normalized.tier,
        status: normalized.status,
        purchase_type: normalized.purchase_type,
        reason: requestReason,
      });
      return createSecureResponse(normalized);
    }

    if (entitlementError) {
      logStep('Failed reading user_entitlements, reconciling with Stripe', {
        message: entitlementError.message,
      });
    } else {
      logStep('Entitlements missing/stale, reconciling with Stripe', {
        userId: user.id,
        rowCount: typedRows.length,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id ?? null;

    if (customers.data.length === 0) {
      logStep('No Stripe customer found');
      const emptyResponse = normalizeFromStripeSubscription(null);
      await syncProfileFromResponse(supabaseClient, user.id, emptyResponse.response);
      return createSecureResponse(emptyResponse.response);
    }

    logStep('Found Stripe customer', { customerId });

    // Cache the resolved Stripe customer id on the profile (keyed by user_id).
    // NOTE: the `private_profiles` PII-separation table is not deployed; billing
    // identifiers live on `profiles`. See docs/ACTIVE/PAYMENTS_AUDIT.md.
    await supabaseClient
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);

    const subscriptions = customerId
      ? await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })
      : { data: [] as Stripe.Subscription[] };

    const bestSubscription = pickBestStripeSubscription(subscriptions.data);
    const { response, entitlementRow } = normalizeFromStripeSubscription(bestSubscription);
    const priorNormalized = normalizeFromEntitlement(primary);
    const hasMismatchBeforeReconcile =
      priorNormalized.tier !== response.tier ||
      priorNormalized.status !== response.status ||
      priorNormalized.purchase_type !== response.purchase_type;

    if (hasMismatchBeforeReconcile) {
      logStep('Reconciliation mismatch detected', {
        reason: requestReason,
        userId: user.id,
        before: priorNormalized,
        after: response,
      });
    }

    await supabaseClient.from('user_entitlements').upsert(
      {
        user_id: user.id,
        ...entitlementRow,
      },
      { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
    );

    await syncProfileFromResponse(supabaseClient, user.id, response);

    if (!response.subscribed) {
      logStep('No effective subscription after Stripe reconcile, checking for Trip Pass');

      const { data: passData } = await supabaseClient
        .from('user_entitlements')
        .select('*')
        .eq('user_id', user.id)
        .eq('purchase_type', 'pass')
        .eq('status', 'active')
        .maybeSingle();

      if (
        passData &&
        passData.current_period_end &&
        new Date(passData.current_period_end) > new Date()
      ) {
        const passTier = passData.plan || 'explorer';
        logStep('Active Trip Pass found', { tier: passTier, expires: passData.current_period_end });

        return createSecureResponse({
          subscribed: true,
          status: passData.status,
          tier: passTier,
          product_id: null,
          subscription_end: passData.current_period_end,
          purchase_type: 'pass',
          current_period_end: passData.current_period_end,
        });
      }
    } else {
      logStep('Stripe reconcile produced active subscription', {
        tier: response.tier,
        status: response.status,
      });
    }

    return createSecureResponse(response);
  } catch (error) {
    logError('CHECK_SUBSCRIPTION', error);
    return createErrorResponse(sanitizeErrorForClient(error), 500);
  }
});
