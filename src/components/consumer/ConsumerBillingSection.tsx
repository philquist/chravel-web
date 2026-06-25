import React, { useEffect, useState } from 'react';
import { Crown, Globe, Building, TrendingUp, Shield, Ticket } from 'lucide-react';
import { useConsumerSubscription } from '../../hooks/useConsumerSubscription';
import { CONSUMER_PRICING } from '../../types/consumer';
import { CONSUMER_PRICE_DISPLAY, TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';
import { BILLING_PRODUCTS } from '@/billing/config';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { detectNativeBillingPlatform, isNativeWebView } from '@/utils/platformDetection';
import {
  purchaseConsumerSubscription,
  purchaseProSubscription,
} from '@/integrations/revenuecat/revenuecatClient';
import { TripPassModal } from '../conversion/TripPassModal';


// App Store 3.1.1: inside the iOS app, consumers must not be steered to an external
// web checkout or the Stripe-hosted billing portal for digital subscriptions. Manage/
// cancel must route to Apple's native subscription settings instead.
const IOS_SUBSCRIPTIONS_URL = 'itms-apps://apps.apple.com/account/subscriptions';

export const ConsumerBillingSection = () => {
  const {
    subscription,
    tier,
    isSubscribed,
    upgradeToTier,
    isLoading,
    isSuperAdmin,
    proTier,
    checkSubscription,
  } = useConsumerSubscription();
  const [expandedPlan, setExpandedPlan] = useState<string | null>(tier);
  const [expandedProPlan, setExpandedProPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [tripPassOpen, setTripPassOpen] = useState(false);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);
  const isNativeIOS =
    detectNativeBillingPlatform(
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      isNativeWebView(),
    ) === 'ios';
  // Manage / cancel of an existing subscription still routes to Apple's native
  // subscription settings on iOS (required), but new purchases now go through
  // Apple IAP via RevenueCat instead of being blocked.
  const useAppleManagementOnIOS = isNativeIOS;


  const handleManageSubscription = async () => {
    if (blockConsumerCheckoutOnIOS) {
      // Route to Apple's native subscription management, not the external Stripe portal.
      window.location.assign(IOS_SUBSCRIPTIONS_URL);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;

      // Handle case where user has no Stripe subscription history
      if (data?.error === 'no_subscription') {
        toast.info(
          data.message ||
            "You don't have an active subscription yet. Choose a plan below to get started!",
        );
        return;
      }

      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('Unable to open subscription portal. Please try again.');
      }
    } catch (error) {
      toast.error(
        `Failed to open customer portal: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      console.error(error);
    }
  };

  const handleCancelSubscription = async () => {
    if (blockConsumerCheckoutOnIOS) {
      // Apple requires cancellation of digital subscriptions via iOS settings, not a web portal.
      window.location.assign(IOS_SUBSCRIPTIONS_URL);
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.',
    );

    if (!confirmed) return;

    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;

      // Handle case where user has no Stripe subscription history
      if (data?.error === 'no_subscription') {
        toast.info("You don't have an active subscription to cancel.");
        return;
      }

      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('Unable to open cancellation page. Please try again.');
      }
    } catch (error) {
      toast.error(
        `Failed to open cancellation page: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      console.error(error);
    }
  };

  const handleUpgradeToProPlan = async (planKey: string) => {
    // App Store 3.1.1: no external purchase entry points from the iOS app.
    if (isNativeIOS) {
      toast.info('Subscriptions are managed on chravel.app on the web.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier: planKey },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('Failed to create checkout session');
      }
    } catch (error) {
      toast.error(
        `Failed to start checkout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      console.error(error);
    }
  };

  const plans = {
    free: {
      name: 'Free',
      price: 0,
      icon: Crown,
      features: [
        'Up to 3 active trips (archive to save more)',
        'Unlimited participants',
        'Core group chat',
        'Shared calendar (manual)',
        'Photo & video sharing',
        'Basic itinerary planning',
        'Expense tracking',
        'AI Trip Assistant (3 queries per user per trip)',
        '1 PDF export per trip',
        'ICS calendar download',
      ],
    },
    explorer: {
      name: 'Explorer',
      price: CONSUMER_PRICING.explorer.monthly,
      annualPrice: CONSUMER_PRICING.explorer.annual,
      icon: Globe,
      features: [
        'Unlimited saved trips + restore archived',
        '25 AI queries per user per trip',
        'Unlimited PDF exports',
        'Smart Import (Calendar, Agenda, Line-up from URL)',
        'Location-aware AI suggestions',
        'Smart notifications',
        'Search past trips',
        'Priority support',
        'Custom trip categories & tagging',
      ],
    },
    'frequent-chraveler': {
      name: 'Frequent Chraveler',
      price: CONSUMER_PRICING['frequent-chraveler'].monthly,
      annualPrice: CONSUMER_PRICING['frequent-chraveler'].annual,
      icon: Crown,
      features: [
        'Everything in Explorer',
        'Unlimited AI queries',
        'Smart Import (Calendar, Agenda, Line-up from URL, paste, or file)',
        'Calendar sync (Google, Apple, Outlook)',
        'PDF trip export',
        'Create 1 Chravel Pro trip per month (50-seat limit)',
        'Role-based channels on Pro trips',
        'Custom trip categories & tagging',
        'Early feature access',
      ],
    },
  } as const;

  return (
    <div className="space-y-3">
      {blockConsumerCheckoutOnIOS && (
        <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/30">
          <h4 className="text-white font-semibold mb-1">iOS Billing Update</h4>
          <p className="text-sm text-blue-200">
            Consumer subscriptions are temporarily unavailable in this iOS build while Apple In-App
            Purchase is finalized.
          </p>
        </div>
      )}

      {/* Current Plan */}
      <div
        className={`rounded-xl p-4 ${
          isSubscribed
            ? 'bg-gradient-to-r from-gold-primary/10 to-gold-primary/5 border border-gold-primary/20'
            : 'bg-gradient-to-r from-primary/10 to-primary/15 border border-primary/20'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-xl font-bold text-white flex items-center gap-2 capitalize">
                {tier}
                {isSubscribed && <Crown size={20} className="text-gold-primary" />}
              </h4>
              <p className={isSubscribed ? 'text-gold-primary' : 'text-primary'}>
                {isSubscribed ? 'Premium Features Active' : 'Free Forever'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              ${plans[tier as keyof typeof plans].price}/month
            </div>
            {isSubscribed && subscription?.status === 'trial' && (
              <div className="text-sm text-gold-primary">Trial Active</div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <h5 className="font-semibold text-white mb-2">Current Plan Features</h5>
          <ul className="space-y-1.5 text-sm text-gray-300">
            {plans[tier as keyof typeof plans].features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2">
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                    isSubscribed ? 'bg-gold-primary' : 'bg-primary'
                  }`}
                ></div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {!isSubscribed && (
          <button
            onClick={() => upgradeToTier('explorer', billingCycle)}
            disabled={isLoading || blockConsumerCheckoutOnIOS}
            className="bg-gradient-to-r from-gold-primary to-gold-mid hover:from-gold-mid hover:to-gold-primary text-black px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {blockConsumerCheckoutOnIOS
              ? 'Unavailable on iOS'
              : isLoading
                ? 'Processing...'
                : 'View Upgrade Options'}
          </button>
        )}

        {isSubscribed && (
          <div className="flex gap-3">
            {isSuperAdmin ? (
              <div className="text-sm text-gold-primary bg-gold-primary/10 px-4 py-2 rounded-lg border border-gold-primary/20">
                ✦ Founder Access — All features unlocked
              </div>
            ) : (
              <>
                <button
                  onClick={handleManageSubscription}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Manage Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel Subscription
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Billing Period Toggle */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Billing Period</h4>
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              billingCycle === 'monthly'
                ? 'bg-gold-primary text-black'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              billingCycle === 'annual'
                ? 'bg-gold-primary text-black'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Annual <span className="text-xs opacity-75">(Save 17%)</span>
          </button>
        </div>
        <div className="text-sm text-gray-400 mb-4">
          {billingCycle === 'monthly' ? (
            <span>
              Explorer: {CONSUMER_PRICE_DISPLAY.explorer.monthly}/mo • Frequent Chraveler:{' '}
              {CONSUMER_PRICE_DISPLAY['frequent-chraveler'].monthly}/mo
            </span>
          ) : (
            <span>
              Explorer: {CONSUMER_PRICE_DISPLAY.explorer.annual}/yr (
              {CONSUMER_PRICE_DISPLAY.explorer.annualPerMonth}/mo) • Frequent Chraveler:{' '}
              {CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annual}/yr (
              {CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annualPerMonth}/mo)
            </span>
          )}
        </div>
      </div>

      {/* One-time Trip Pass — alternative to recurring subscriptions */}
      {!isSubscribed && !isSuperAdmin && (
        <div className="bg-gradient-to-br from-gold-primary/10 to-gold-primary/5 border border-gold-primary/30 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-[220px]">
              <div className="w-10 h-10 rounded-full bg-gold-primary/20 text-gold-primary flex items-center justify-center flex-shrink-0">
                <Ticket size={20} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white mb-1">One-time Trip Pass</h4>
                <p className="text-sm text-gray-300">
                  Full premium for one trip — no recurring charge. Explorer{' '}
                  {TRIP_PASS_DISPLAY.explorer.price} ({TRIP_PASS_DISPLAY.explorer.durationDays}{' '}
                  days) · Frequent Chraveler {TRIP_PASS_DISPLAY['frequent-chraveler'].price} (
                  {TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days).
                </p>
              </div>
            </div>
            <button
              onClick={() => setTripPassOpen(true)}
              disabled={blockConsumerCheckoutOnIOS}
              className="min-h-[42px] bg-gradient-to-r from-gold-primary to-gold-mid hover:from-gold-mid hover:to-gold-primary text-black px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {blockConsumerCheckoutOnIOS ? 'Unavailable on iOS' : 'Get a Trip Pass'}
            </button>
          </div>
        </div>
      )}

      <TripPassModal open={tripPassOpen} onOpenChange={setTripPassOpen} />

      {/* Available Plans */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Available Plans</h4>
        <div className="space-y-3">
          {Object.entries(plans).map(([key, plan]) => {
            const PlanIcon = plan.icon;
            return (
              <Collapsible
                key={key}
                open={expandedPlan === key}
                onOpenChange={() => setExpandedPlan(expandedPlan === key ? null : key)}
              >
                <CollapsibleTrigger className="w-full">
                  <div
                    className={`border rounded-lg p-3 transition-colors hover:bg-white/5 ${
                      key === tier
                        ? 'border-gold-primary/50 bg-gold-primary/10'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left flex items-center gap-3">
                        <PlanIcon
                          size={20}
                          className={key === tier ? 'text-gold-primary' : 'text-gray-400'}
                        />
                        <div>
                          <h5 className="font-semibold text-white flex items-center gap-2 capitalize">
                            {plan.name}
                          </h5>
                          <div className="text-xl font-bold text-white">${plan.price}/month</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {key === tier && (
                          <div className="text-sm text-gold-primary font-medium">Current Plan</div>
                        )}
                        <div className="text-gray-400">{expandedPlan === key ? '−' : '+'}</div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-white/5 rounded-lg p-3 ml-4">
                    <h6 className="font-medium text-white mb-2">Features Included:</h6>
                    <ul className="space-y-1.5 text-sm text-gray-300">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-gold-primary rounded-full mt-2 flex-shrink-0"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {key !== 'free' && key !== tier && (
                      <button
                        onClick={() =>
                          upgradeToTier(key as 'explorer' | 'frequent-chraveler', billingCycle)
                        }
                        disabled={
                          isLoading ||
                          (isNativeIOS && (key === 'explorer' || key === 'frequent-chraveler'))
                        }
                        className="mt-4 bg-gradient-to-r from-gold-primary to-gold-mid hover:from-gold-mid hover:to-gold-primary text-black px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {isNativeIOS && (key === 'explorer' || key === 'frequent-chraveler')
                          ? 'Unavailable on iOS'
                          : isLoading
                            ? 'Processing...'
                            : `Upgrade to ${plan.name}`}
                      </button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* Pro Organization Plans Section */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-2">
          Organization Plans (ChravelApp Pro)
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          For teams, sports organizations, tours, and enterprises. Pro subscribers get all Frequent
          Chraveler benefits included.
        </p>
        {isNativeIOS && (
          <p className="text-xs text-muted-foreground mb-3">
            Subscriptions are managed on chravel.app on the web.
          </p>
        )}

        <div className="space-y-3">
          {Object.entries(proPlans).map(([key, plan]) => {
            const PlanIcon = plan.icon;
            const isCurrentProPlan = isSuperAdmin && key === proTier;
            return (
              <Collapsible
                key={key}
                open={expandedProPlan === key}
                onOpenChange={() => setExpandedProPlan(expandedProPlan === key ? null : key)}
              >
                <CollapsibleTrigger className="w-full">
                  <div
                    className={`border rounded-lg p-3 transition-colors hover:bg-white/10 ${
                      isCurrentProPlan
                        ? 'border-gold-primary/50 bg-gold-primary/10'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left flex items-center gap-3">
                        <PlanIcon
                          size={20}
                          className={isCurrentProPlan ? 'text-gold-primary' : 'text-primary'}
                        />
                        <div>
                          <h5 className="font-semibold text-foreground flex items-center gap-2">
                            {plan.name}
                          </h5>
                          <div className="text-xl font-bold text-foreground">
                            ${plan.price}/month
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCurrentProPlan && (
                          <div className="text-sm text-gold-primary font-medium">Current Plan</div>
                        )}
                        <div className="text-muted-foreground">
                          {expandedProPlan === key ? '−' : '+'}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-white/5 rounded-lg p-3 ml-4">
                    <h6 className="font-medium text-foreground mb-2">Features Included:</h6>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {!isCurrentProPlan && (
                      <button
                        onClick={() => handleUpgradeToProPlan(key)}
                        disabled={isLoading || isNativeIOS}
                        className="mt-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {isNativeIOS
                          ? 'Manage on chravel.app'
                          : isLoading
                            ? 'Processing...'
                            : `Upgrade to ${plan.name}`}
                      </button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const proPlans = {
  'pro-starter': {
    name: 'Starter Pro',
    price: BILLING_PRODUCTS['pro-starter'].priceMonthly,
    icon: Building,
    features: [
      'Up to 50 team members',
      'Advanced permissions',
      'Team management dashboard',
      'Basic integrations',
      'Email support',
      '✦ Unlimited Events for your team',
      '✦ Your first Pro Trip + Event included free',
      '✦ Includes all Frequent Chraveler benefits',
    ],
  },
  'pro-growth': {
    name: 'Growth Pro',
    price: BILLING_PRODUCTS['pro-growth'].priceMonthly,
    icon: TrendingUp,
    features: [
      'Up to 100 team members',
      'Multi-language support',
      'Priority support',
      'Advanced integrations',
      'Custom workflows',
      '✦ Unlimited Events for your team',
      '✦ Your first Pro Trip + Event included free',
      '✦ Includes all Frequent Chraveler benefits',
    ],
  },
  'pro-enterprise': {
    name: 'Enterprise',
    price: 199,
    icon: Shield,
    features: [
      'Up to 250 team members',
      'Custom integrations',
      'Dedicated success manager',
      '24/7 premium support',
      '✦ Unlimited Events for your team',
      '✦ Your first Pro Trip + Event included free',
      '✦ Includes all Frequent Chraveler benefits',
    ],
  },
} as const;
