import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldAlert,
  Ticket,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { getCustomerInfo, isNativePlatform } from '@/integrations/revenuecat/revenuecatClient';
import type { RevenueCatCustomerInfo } from '@/integrations/revenuecat/types';
import { RestorePurchasesButton } from '@/components/billing/RestorePurchasesButton';
import { openExternalUrl } from '@/platform/navigation';
import { detectNativeBillingPlatform, isNativeWebView } from '@/utils/platformDetection';

/**
 * Subscription Status
 * -------------------
 * Single-source view of the user's paid state for the App Store review team
 * and end users. Combines two truths:
 *
 *   • Supabase (`check-subscription` edge fn)  — server-verified tier + expiry.
 *     Populated for both Stripe (web) and Apple (iOS via RevenueCat sync).
 *   • RevenueCat customerInfo (App Store receipt) — willRenew, periodType,
 *     billingIssueDetectedAt, unsubscribeDetectedAt, active Trip Passes.
 *
 * Web-only sessions show the Supabase view; iOS also renders the receipt panel.
 */

const TRIP_PASS_ID_RE = /trippass|\.pass\d+/i;

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  explorer: 'Explorer',
  'frequent-chraveler': 'Frequent Chraveler',
  'pro-starter': 'Starter Pro',
  'pro-growth': 'Growth Pro',
  'pro-enterprise': 'Enterprise Pro',
};

const IOS_SUBSCRIPTIONS_URL = 'itms-apps://apps.apple.com/account/subscriptions';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

interface DerivedReceipt {
  activeSubProductId: string | null;
  willRenew: boolean;
  periodType: 'normal' | 'trial' | 'intro' | null;
  expirationDate: string | null;
  billingIssue: boolean;
  unsubscribeDetected: boolean;
  isSandbox: boolean;
  tripPasses: { productId: string; expirationDate: string | null; isActive: boolean }[];
}

function deriveReceipt(info: RevenueCatCustomerInfo | null): DerivedReceipt | null {
  if (!info) return null;
  const active = info.entitlements?.active ?? {};
  const entries = Object.values(active);
  const sub =
    entries.find(e => e.productIdentifier && !TRIP_PASS_ID_RE.test(e.productIdentifier)) ?? null;
  const tripPasses = entries
    .filter(e => e.productIdentifier && TRIP_PASS_ID_RE.test(e.productIdentifier))
    .map(e => ({
      productId: e.productIdentifier,
      expirationDate: e.expirationDate,
      isActive: e.isActive,
    }));

  return {
    activeSubProductId: sub?.productIdentifier ?? null,
    willRenew: sub?.willRenew ?? false,
    periodType: sub?.periodType ?? null,
    expirationDate: sub?.expirationDate ?? info.latestExpirationDate ?? null,
    billingIssue: !!sub?.billingIssueDetectedAt,
    unsubscribeDetected: !!sub?.unsubscribeDetectedAt,
    isSandbox: sub?.isSandbox ?? false,
    tripPasses,
  };
}

const StatusBadge: React.FC<{
  status: 'active' | 'trial' | 'expired' | 'cancelled' | 'past_due';
}> = ({ status }) => {
  const map = {
    active: { label: 'Active', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    trial: { label: 'Trial', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
    cancelled: { label: 'Canceled', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    past_due: { label: 'Past due', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    expired: { label: 'Expired', cls: 'bg-white/10 text-white/70 border-white/15' },
  } as const;
  const { label, cls } = map[status] ?? map.expired;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
    >
      {label}
    </span>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode }> = ({
  label,
  value,
  icon,
}) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
    <div className="flex items-center gap-2 text-sm text-white/60">
      {icon}
      {label}
    </div>
    <div className="text-sm text-white font-medium text-right">{value}</div>
  </div>
);

export default function SubscriptionStatus() {
  const { user } = useAuth();
  const { subscription, tier, isLoading, checkSubscription, isSuperAdmin } =
    useConsumerSubscription();
  const [receipt, setReceipt] = useState<RevenueCatCustomerInfo | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const isIOS =
    typeof navigator !== 'undefined' &&
    detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView()) === 'ios';

  const loadReceipt = useCallback(async () => {
    if (!isNativePlatform()) return;
    setReceiptLoading(true);
    setReceiptError(null);
    const res = await getCustomerInfo();
    if (res.success && res.data) {
      setReceipt(res.data);
    } else if (res.errorCode !== 'NOT_SUPPORTED') {
      setReceiptError(res.error ?? 'Could not read App Store receipt.');
    }
    setReceiptLoading(false);
  }, []);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  const derived = deriveReceipt(receipt);
  const supabaseStatus = subscription?.status ?? (isSuperAdmin ? 'active' : 'expired');
  const endsAt = subscription?.subscriptionEndsAt ?? derived?.expirationDate ?? null;
  const daysLeft = daysUntil(endsAt);

  const paymentSource: 'apple' | 'web' | 'none' | 'admin' = isSuperAdmin
    ? 'admin'
    : derived?.activeSubProductId
      ? 'apple'
      : subscription?.stripeCustomerId
        ? 'web'
        : 'none';

  const handleManage = () => {
    if (isIOS) openExternalUrl(IOS_SUBSCRIPTIONS_URL);
    else openExternalUrl('/settings/billing');
  };

  return (
    <div className="min-h-screen bg-luxury-dark text-white">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-luxury-dark/95 backdrop-blur-md mobile-safe-header">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm text-white/60 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <h1 className="ml-auto text-2xl font-serif">Subscription</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))]">
        {/* Active plan */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50">Active plan</div>
              <div className="text-2xl font-serif mt-1">
                {TIER_LABELS[tier] ?? tier}
                {isSuperAdmin ? (
                  <span className="ml-2 text-xs text-gold-primary">(Admin)</span>
                ) : null}
              </div>
            </div>
            <StatusBadge
              status={
                (supabaseStatus === 'cancelled'
                  ? 'cancelled'
                  : supabaseStatus === 'trial'
                    ? 'trial'
                    : supabaseStatus === 'active'
                      ? 'active'
                      : 'expired') as never
              }
            />
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin" /> Refreshing from server…
            </div>
          ) : null}

          <div>
            <Row
              icon={<Calendar size={14} />}
              label={
                supabaseStatus === 'cancelled'
                  ? 'Access ends'
                  : derived?.willRenew
                    ? 'Renews'
                    : 'Expires'
              }
              value={
                endsAt ? (
                  <>
                    {formatDate(endsAt)}
                    {daysLeft !== null && daysLeft >= 0 ? (
                      <span className="text-white/50 font-normal">
                        {' '}
                        · {daysLeft} day{daysLeft === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </>
                ) : (
                  '—'
                )
              }
            />
            <Row
              icon={<CreditCard size={14} />}
              label="Payment source"
              value={
                paymentSource === 'apple'
                  ? 'Apple In-App Purchase'
                  : paymentSource === 'web'
                    ? 'Stripe (web)'
                    : paymentSource === 'admin'
                      ? 'Admin override'
                      : 'None'
              }
            />
            {derived?.activeSubProductId ? (
              <Row
                label="Product ID"
                value={<code className="text-xs">{derived.activeSubProductId}</code>}
              />
            ) : null}
            {derived?.periodType && derived.periodType !== 'normal' ? (
              <Row label="Period" value={derived.periodType} />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void checkSubscription()}
              className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5"
            >
              <Loader2 size={14} className={isLoading ? 'animate-spin' : 'opacity-0'} />
              Refresh status
            </button>
            <button
              type="button"
              onClick={handleManage}
              className="inline-flex items-center gap-1.5 text-sm rounded-lg bg-gold-primary/90 hover:bg-gold-primary text-black font-semibold px-3 py-1.5"
            >
              {isIOS ? 'Manage in Apple' : 'Manage billing'}
            </button>
          </div>
        </section>

        {/* Payment state alerts */}
        {derived?.billingIssue ? (
          <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3">
            <ShieldAlert className="shrink-0 mt-0.5" size={18} />
            <div className="text-sm">
              <div className="font-semibold text-red-100">Billing issue detected</div>
              <div className="text-red-200/90">
                Apple could not charge your payment method. Open{' '}
                <button className="underline" onClick={handleManage}>
                  Manage in Apple
                </button>{' '}
                to update your card before {formatDate(derived.expirationDate)}.
              </div>
            </div>
          </section>
        ) : null}

        {derived?.unsubscribeDetected && !derived.billingIssue ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <div className="text-sm">
              <div className="font-semibold text-amber-100">Auto-renew is off</div>
              <div className="text-amber-200/90">
                Access continues through {formatDate(derived.expirationDate)}. Re-enable renewal any
                time in Apple settings.
              </div>
            </div>
          </section>
        ) : null}

        {derived?.isSandbox ? (
          <div className="text-xs text-white/40 border border-white/10 rounded-lg px-3 py-2">
            Sandbox receipt — this device is signed into a StoreKit test account.
          </div>
        ) : null}

        {/* Trip Passes */}
        {derived && derived.tripPasses.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-white/50">
              <Ticket size={14} /> Trip Passes
            </div>
            <ul className="space-y-2">
              {derived.tripPasses.map(p => (
                <li
                  key={p.productId}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{p.productId}</div>
                    <div className="text-xs text-white/50">
                      {p.isActive ? 'Active' : 'Inactive'} · expires {formatDate(p.expirationDate)}
                    </div>
                  </div>
                  {p.isActive ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <XCircle size={16} className="text-white/40" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Receipt loader error */}
        {receiptError ? (
          <div className="text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
            App Store receipt: {receiptError}
          </div>
        ) : null}

        {/* Restore + reload */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Missing a purchase you made?
          </div>
          <RestorePurchasesButton
            variant="block"
            onRestored={async () => {
              await checkSubscription();
              await loadReceipt();
            }}
          />
        </section>

        {!user ? (
          <div className="text-sm text-white/60 border border-white/10 rounded-lg px-3 py-2">
            Sign in to view your subscription.
          </div>
        ) : null}

        {receiptLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 size={12} className="animate-spin" /> Reading App Store receipt…
          </div>
        ) : null}
      </div>
    </div>
  );
}
