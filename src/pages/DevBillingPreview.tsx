/**
 * Dev-only preview page for capturing App Store IAP review screenshots.
 *
 * Two modes:
 *  - No params → renders the full ConsumerBillingSection (legacy, exploratory)
 *  - ?product=<appleProductId> → renders a single, unambiguous review card for that
 *    exact Apple product ID (used by Playwright to capture per-IAP review screenshots).
 *
 * The per-product mode is designed for App Store Connect "App Review Screenshot"
 * uploads: each PNG shows one product with its exact Apple ID, reference name,
 * price, duration, and the Apple-branded CTA required by guideline 3.1.1.
 *
 * NOT linked in production navigation.
 */
import React from 'react';
import { Ticket, Crown, Globe, Building, TrendingUp } from 'lucide-react';
import { ConsumerBillingSection } from '@/components/consumer/ConsumerBillingSection';
import { CONSUMER_PRICE_DISPLAY, TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';

type ReviewCard = {
  productId: string;
  referenceName: string;
  planName: string;
  duration: string;
  price: string;
  perLabel: string;
  cta: string;
  icon: React.ReactNode;
  bullets: string[];
};

const CARDS: Record<string, ReviewCard> = {
  'com.chravel.explorer.monthly': {
    productId: 'com.chravel.explorer.monthly',
    referenceName: 'Explorer Monthly',
    planName: 'Explorer',
    duration: '1 Month',
    price: CONSUMER_PRICE_DISPLAY.explorer.monthly,
    perLabel: '/ month',
    cta: 'Subscribe with Apple',
    icon: <Globe size={28} />,
    bullets: [
      'Unlimited saved trips + restore archived',
      '25 AI queries per user per trip',
      'Unlimited PDF exports',
      'Smart Import + ICS calendar export',
    ],
  },
  'com.chravel.frequentchraveler.monthly': {
    productId: 'com.chravel.frequentchraveler.monthly',
    referenceName: 'Frequent Chraveler Monthly',
    planName: 'Frequent Chraveler',
    duration: '1 Month',
    price: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].monthly,
    perLabel: '/ month',
    cta: 'Subscribe with Apple',
    icon: <Crown size={28} />,
    bullets: [
      'Unlimited saved trips',
      'Unlimited AI Concierge queries',
      'Role-based channels & Pro features',
      'Smart Import (Calendar, Agenda, Line-up)',
    ],
  },
  'com.chravel.explorer.annual': {
    productId: 'com.chravel.explorer.annual',
    referenceName: 'Explorer Annual',
    planName: 'Explorer',
    duration: '1 Year',
    price: CONSUMER_PRICE_DISPLAY.explorer.annual,
    perLabel: '/ year',
    cta: 'Subscribe with Apple',
    icon: <Globe size={28} />,
    bullets: [
      'Unlimited saved trips + restore archived',
      '25 AI queries per user per trip',
      'Unlimited PDF exports',
      'Smart Import + ICS calendar export',
    ],
  },
  'com.chravel.frequentchraveler.annual': {
    productId: 'com.chravel.frequentchraveler.annual',
    referenceName: 'Frequent Chraveler Annual',
    planName: 'Frequent Chraveler',
    duration: '1 Year',
    price: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annual,
    perLabel: '/ year',
    cta: 'Subscribe with Apple',
    icon: <Crown size={28} />,
    bullets: [
      'Unlimited saved trips',
      'Unlimited AI Concierge queries',
      'Role-based channels & Pro features',
      'Priority support & early feature access',
    ],
  },
  'com.chravel.pro.starter.monthly': {
    productId: 'com.chravel.pro.starter.monthly',
    referenceName: 'Starter Pro Monthly',
    planName: 'Starter Pro',
    duration: '1 Month',
    price: '$49',
    perLabel: '/ month',
    cta: 'Subscribe with Apple',
    icon: <Building size={28} />,
    bullets: [
      'For small teams and touring crews',
      'Role-based channels & permissions',
      'Approvals, logistics, and rosters',
      'Everything in Frequent Chraveler',
    ],
  },
  'com.chravel.pro.growth.monthly': {
    productId: 'com.chravel.pro.growth.monthly',
    referenceName: 'Growth Pro Monthly',
    planName: 'Growth Pro',
    duration: '1 Month',
    price: '$99',
    perLabel: '/ month',
    cta: 'Subscribe with Apple',
    icon: <TrendingUp size={28} />,
    bullets: [
      'For growing organizations',
      'Advanced team coordination',
      'Compliance and audit trails',
      'Everything in Starter Pro',
    ],
  },
  'com.chravel.trippass.explorer': {
    productId: 'com.chravel.trippass.explorer',
    referenceName: 'Explorer Trip Pass',
    planName: 'Explorer Trip Pass',
    duration: `${TRIP_PASS_DISPLAY.explorer.durationDays} days`,
    price: TRIP_PASS_DISPLAY.explorer.price,
    perLabel: 'one-time',
    cta: 'Buy with Apple',
    icon: <Ticket size={28} />,
    bullets: [
      'Full Explorer features for one trip window',
      '25 AI queries per user per trip',
      'Unlimited PDF exports',
      'Smart Import + ICS calendar export',
    ],
  },
  'com.chravel.trippass.frequent': {
    productId: 'com.chravel.trippass.frequent',
    referenceName: 'Frequent Chraveler Trip Pass',
    planName: 'Frequent Chraveler Trip Pass',
    duration: `${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days`,
    price: TRIP_PASS_DISPLAY['frequent-chraveler'].price,
    perLabel: 'one-time',
    cta: 'Buy with Apple',
    icon: <Ticket size={28} />,
    bullets: [
      'Full Frequent Chraveler features for multi-city trips',
      'Unlimited AI queries (24/7 concierge)',
      'Smart Import (URL, paste, or file)',
      'Role-based channels & Pro features',
    ],
  },
};

function ReviewProductCard({ card }: { card: ReviewCard }) {
  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col px-5 pt-6 pb-10"
      data-testid="iap-review-card"
      data-product-id={card.productId}
    >
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold text-white">Billing</h1>
        <p className="text-xs text-muted-foreground mt-1">
          In-App Purchase preview · App Review
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/80 shadow-xl p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            {card.icon}
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{card.planName}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
              {card.duration}
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold text-foreground">{card.price}</span>
            <span className="text-sm text-muted-foreground">{card.perLabel}</span>
          </div>
        </div>

        <ul className="space-y-2 mt-2">
          {card.bullets.map(b => (
            <li key={b} className="flex items-start gap-2 text-sm text-foreground">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="w-full mt-3 rounded-lg bg-primary text-primary-foreground py-3 text-base font-semibold"
          data-testid="iap-review-cta"
        >
          {card.cta}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-border/40 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <div>
          <span className="text-muted-foreground/80">Apple Product ID: </span>
          <span className="text-foreground font-mono">{card.productId}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">Reference Name: </span>
          <span className="text-foreground">{card.referenceName}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">Duration: </span>
          <span className="text-foreground">{card.duration}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">US Price: </span>
          <span className="text-foreground">
            {card.price} {card.perLabel}
          </span>
        </div>
        <p className="pt-2 text-[11px] leading-relaxed">
          All iOS purchases route through StoreKit / RevenueCat. No external payment links.
        </p>
      </div>
    </div>
  );
}

export default function DevBillingPreview() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('product');

  if (productId && CARDS[productId]) {
    return <ReviewProductCard card={CARDS[productId]} />;
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground p-4 pb-24"
      data-testid="dev-billing-preview"
    >
      <h1 className="text-lg font-bold text-white mb-4">Billing</h1>
      <ConsumerBillingSection />
    </div>
  );
}
