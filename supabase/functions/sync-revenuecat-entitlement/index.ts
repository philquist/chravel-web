import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  USER_ENTITLEMENT_CONFLICT_TARGET,
  isTripPassProductId,
  resolvePurchaseTypeForProductId,
  type RevenueCatPurchaseType,
} from '../_shared/entitlementUpsert.ts';

// Entitlement ID to plan mapping (must match RevenueCat dashboard)
const ENTITLEMENT_TO_PLAN: Record<string, string> = {
  chravel_explorer: 'explorer',
  chravel_frequent_chraveler: 'frequent-chraveler',
  chravel_pro_starter: 'pro-starter',
  chravel_pro_growth: 'pro-growth',
  chravel_pro_enterprise: 'pro-enterprise',
};

const PLAN_PRIORITY = [
  'free',
  'explorer',
  'frequent-chraveler',
  'pro-starter',
  'pro-growth',
  'pro-enterprise',
];

interface ActiveEntitlementInfo {
  isActive: boolean;
  expirationDate: string | null;
  periodType?: string;
  productIdentifier?: string;
}

interface SyncRequest {
  customerInfo: {
    originalAppUserId: string;
    entitlements: {
      active: Record<string, ActiveEntitlementInfo>;
    };
    latestExpirationDate: string | null;
  };
  productId?: string;
  syncAll?: boolean;
}

interface DerivedRow {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  entitlementIds: string[];
  purchaseType: RevenueCatPurchaseType;
}

function deriveRowForPurchaseType(
  activeEntitlements: Record<string, ActiveEntitlementInfo>,
  purchaseType: RevenueCatPurchaseType,
): DerivedRow {
  let plan = 'free';
  let status = 'active';
  let currentPeriodEnd: string | null = null;
  const entitlementIds: string[] = [];

  for (const [entitlementId, info] of Object.entries(activeEntitlements)) {
    if (!info.isActive) continue;

    const rowType = resolvePurchaseTypeForProductId(info.productIdentifier ?? null);
    if (rowType !== purchaseType) continue;

    entitlementIds.push(entitlementId);
    const mappedPlan = ENTITLEMENT_TO_PLAN[entitlementId];
    if (mappedPlan && PLAN_PRIORITY.indexOf(mappedPlan) > PLAN_PRIORITY.indexOf(plan)) {
      plan = mappedPlan;
    }
    if (info.expirationDate) {
      currentPeriodEnd = info.expirationDate;
    }
    if (info.periodType === 'trial') {
      status = 'trialing';
    }
  }

  if (entitlementIds.length === 0) {
    status = 'expired';
  }

  return { plan, status, currentPeriodEnd, entitlementIds, purchaseType };
}

function purchaseTypesToSync(body: SyncRequest): RevenueCatPurchaseType[] {
  if (body.syncAll) return ['subscription', 'pass'];
  if (body.productId) return [resolvePurchaseTypeForProductId(body.productId)];
  const active = body.customerInfo.entitlements?.active ?? {};
  const hasPass = Object.values(active).some(
    e => e.isActive && isTripPassProductId(e.productIdentifier),
  );
  const hasSub = Object.values(active).some(
    e => e.isActive && !isTripPassProductId(e.productIdentifier),
  );
  if (hasPass && hasSub) return ['subscription', 'pass'];
  if (hasPass) return ['pass'];
  return ['subscription'];
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[sync-rc] Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: SyncRequest = await req.json();
    const { customerInfo } = body;

    if (!customerInfo) {
      return new Response(JSON.stringify({ error: 'Missing customerInfo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[sync-rc] Syncing entitlements for user:', user.id, {
      productId: body.productId,
      syncAll: body.syncAll,
    });

    const activeEntitlements = customerInfo.entitlements?.active || {};
    const typesToSync = purchaseTypesToSync(body);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const syncedRows: DerivedRow[] = [];

    for (const purchaseType of typesToSync) {
      const derived = deriveRowForPurchaseType(activeEntitlements, purchaseType);

      const { data: existing } = await serviceClient
        .from('user_entitlements')
        .select('plan, status, current_period_end')
        .eq('user_id', user.id)
        .eq('source', 'revenuecat')
        .eq('purchase_type', purchaseType)
        .maybeSingle();

      const normalizedPeriodEnd = derived.currentPeriodEnd
        ? new Date(derived.currentPeriodEnd).toISOString()
        : null;
      const existingPeriodEnd = existing?.current_period_end
        ? new Date(existing.current_period_end).toISOString()
        : null;

      if (
        existing &&
        existing.plan === derived.plan &&
        existing.status === derived.status &&
        existingPeriodEnd === normalizedPeriodEnd
      ) {
        console.log(`[sync-rc] No change for ${purchaseType} — skipping`);
        syncedRows.push(derived);
        continue;
      }

      const { error: upsertError } = await serviceClient.from('user_entitlements').upsert(
        {
          user_id: user.id,
          source: 'revenuecat',
          plan: derived.plan,
          status: derived.status,
          purchase_type: purchaseType,
          current_period_end: derived.currentPeriodEnd,
          entitlements: derived.entitlementIds,
          revenuecat_customer_id: customerInfo.originalAppUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: USER_ENTITLEMENT_CONFLICT_TARGET },
      );

      if (upsertError) {
        console.error(`[sync-rc] Upsert error (${purchaseType}):`, upsertError);
        return new Response(JSON.stringify({ error: 'Failed to sync entitlements' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      syncedRows.push(derived);
      console.log(`[sync-rc] Synced ${purchaseType}:`, derived);
    }

    const primary =
      syncedRows.find(r => r.purchaseType === 'subscription' && r.plan !== 'free') ??
      syncedRows.find(r => r.purchaseType === 'pass' && r.plan !== 'free') ??
      syncedRows[0];

    return new Response(
      JSON.stringify({
        success: true,
        synced: true,
        plan: primary?.plan ?? 'free',
        status: primary?.status ?? 'expired',
        currentPeriodEnd: primary?.currentPeriodEnd ?? null,
        entitlements: primary?.entitlementIds ?? [],
        purchase_type: primary?.purchaseType ?? 'subscription',
        rows: syncedRows,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[sync-rc] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
