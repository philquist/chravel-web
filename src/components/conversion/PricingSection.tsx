import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { TripPassModal } from './TripPassModal';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Check,
  Building,
  Users,
  Shield,
  Zap,
  Crown,
  Globe,
  Camera,
  MessageSquare,
  Heart,
  Calendar,
  FileText,
  MapPin,
  TrendingUp,
  Ticket,
  Clock,
  PartyPopper,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  detectNativeBillingPlatform,
  isIOSNativeShell,
  isNativeWebView,
} from '@/utils/platformDetection';
import { toast } from 'sonner';
// Pricing/tier data from the central source of truth (billing/config.ts).
import { SUBSCRIPTION_TIERS } from '@/types/pro';
import { CONSUMER_PRICE_DISPLAY, TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';

interface PricingTier {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;
  annualPrice?: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  cta: string;
  popular?: boolean;
  recommended?: boolean;
  enterprise?: boolean;
  category: 'consumer' | 'pro';
  badge?: string;
  savings?: string;
  ctaAction?: () => void;
  limitation?: string;
}

interface PricingSectionProps {
  onSignUp?: () => void;
}

// Consumer Pricing Tiers - Chravel Plus (Free, Explorer, Frequent Chraveler)
const consumerTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free Plan',
    price: '$0',
    description: 'Perfect for trying ChravelApp with your Crew',
    icon: <Users size={24} />,
    features: [
      'Core group chat',
      'Shared calendar',
      'Photo & video sharing',
      'Shared Group Calendar Sync',
      'Payment tracking',
      'Polls & group decisions',
      'AI Trip Assistant (3 queries per user per trip)',
      '1 PDF export per trip (sample it)',
      'Save up to 3 active trips',
    ],
    cta: 'Start First Trip Free',
    category: 'consumer',
    limitation: 'Archive trips to make room for new ones. Upgrade to restore anytime!',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    price: CONSUMER_PRICE_DISPLAY.explorer.monthly,
    annualPrice: CONSUMER_PRICE_DISPLAY.explorer.annual,
    originalPrice: CONSUMER_PRICE_DISPLAY.explorer.originalAnnual,
    description: `For people who travel regularly and want smarter planning. Or grab a Trip Pass for ${TRIP_PASS_DISPLAY.explorer.price} (${TRIP_PASS_DISPLAY.explorer.durationDays} days).`,
    icon: <Globe size={24} />,
    features: [
      'Everything in Free',
      'Unlimited saved trips + restore archived',
      '25 AI queries per user per trip',
      'Unlimited PDF Recap exports',
      'ICS calendar export',
      'Smart Import (Calendar, Agenda, Line-up from URL)',
      'Location-aware AI recommendations',
      'Search past trips and memories',
    ],
    cta: 'Upgrade to Explorer',
    popular: true,
    category: 'consumer',
    badge: 'Most Popular',
    savings: CONSUMER_PRICE_DISPLAY.explorer.annualSavingsLabel,
  },
  {
    id: 'frequent-chraveler',
    name: 'Frequent Chraveler',
    price: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].monthly,
    annualPrice: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annual,
    originalPrice: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].originalAnnual,
    description: `For Frequent Flyers, Teams, and Tours. Or grab a Trip Pass for ${TRIP_PASS_DISPLAY['frequent-chraveler'].price} (${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days).`,
    icon: <Crown size={24} />,
    features: [
      'Everything in Explorer',
      'Unlimited AI queries (24/7 concierge)',
      'Smart Import (Calendar, Agenda, Line-up from URL, paste, or file)',
      'Unlimited PDF Recap trip exports',
      'Role-based channels & Pro features',
      'Custom trip categories',
      'Early feature access',
    ],
    cta: 'Upgrade to Frequent',
    category: 'consumer',
    savings: CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annualSavingsLabel,
  },
];

// Pro/Enterprise Tiers - Chravel Pro (Starter, Growth, Enterprise)
// (SUBSCRIPTION_TIERS / pricing-display imports are hoisted to the top of the file.)

const proTiers: PricingTier[] = [
  {
    id: 'starter-pro',
    name: SUBSCRIPTION_TIERS.starter.name,
    price: `$${SUBSCRIPTION_TIERS.starter.price}`,
    description:
      'Small touring acts, AAU teams, wedding planners, and boutique concierges. Invite coordinators & clients at no extra seat cost.',
    icon: <Building size={24} />,
    features: [...SUBSCRIPTION_TIERS.starter.features],
    cta: 'Start 14-Day Trial',
    category: 'pro',
    enterprise: true,
    ctaAction: () =>
      (window.location.href =
        'mailto:support@chravelapp.com?subject=Starter%20Pro%2014-Day%20Trial'),
  },
  {
    id: 'growth-pro',
    name: SUBSCRIPTION_TIERS.growing.name,
    price: `$${SUBSCRIPTION_TIERS.growing.price}`,
    description:
      'College teams, mid-size productions, corporate groups, and multi-client concierge companies. Full role-based channels + Coordinator Access.',
    icon: <TrendingUp size={24} />,
    features: [...SUBSCRIPTION_TIERS.growing.features],
    cta: 'Start 14-Day Trial',
    popular: true,
    category: 'pro',
    enterprise: true,
    badge: 'Most Popular',
    ctaAction: () =>
      (window.location.href =
        'mailto:support@chravelapp.com?subject=Growth%20Pro%2014-Day%20Trial'),
  },
  {
    id: 'enterprise',
    name: SUBSCRIPTION_TIERS.enterprise.name,
    price: 'Custom Pricing',
    description:
      'Pro leagues, major tours, luxury travel concierge networks, Fortune 500. Volume Pro Trips, dedicated onboarding, contract terms.',
    icon: <Shield size={24} />,
    features: [...SUBSCRIPTION_TIERS.enterprise.features],
    cta: 'Contact Sales',
    category: 'pro',
    enterprise: true,
    ctaAction: () =>
      (window.location.href = 'mailto:billing@chravelapp.com?subject=Enterprise%20Inquiry'),
  },
];

const valuePropItems = [
  {
    icon: <Heart size={20} />,
    title: 'Trips can easily exceed thousands of dollars.',
    description: 'Organizing your memories are worth more than a Trip Pass',
  },
  {
    icon: <Camera size={20} />,
    title: 'Never delete another trip',
    description: 'That sunset in Santorini? Keep it forever.',
  },
  {
    icon: <MessageSquare size={20} />,
    title: 'Unlimited AI assistance',
    description: 'From "what\'s near me?" to complex itinerary planning',
  },
  {
    icon: <MapPin size={20} />,
    title: 'Location-aware suggestions',
    description: '"Find coffee shops within walking distance" - your AI knows where you are',
  },
  {
    icon: <Calendar size={20} />,
    title: 'Seamless calendar sync',
    description: 'Your trips, automatically in your calendar',
  },
  {
    icon: <Users size={20} />,
    title: 'Pro Trips with Role-Based Channels',
    description: 'Filter chat convos to just who needs to be involved',
  },
  {
    icon: <FileText size={20} />,
    title: 'Professional PDF Recap exports',
    description: 'Share beautiful itineraries with one click',
  },
  {
    icon: <Zap size={20} />,
    title: 'Early Access Features',
    description: 'Get early access to our latest features and updates before they roll wide',
  },
  {
    icon: <PartyPopper size={20} />,
    title: 'Plan your next trip, season, or wedding',
    description:
      'Plan your next family trip, sports season, or wedding weekend without ever leaving one app.',
  },
];

const _faqItems = [
  {
    question: 'What happens when I hit my 3-trip limit?',
    answer:
      'Your trips are never deleted! Just archive a trip to make room for new ones. Archived trips are safely stored and can be restored anytime after upgrading to Explorer or Frequent Chraveler.',
  },
  {
    question: 'How do AI queries work on each plan?',
    answer:
      'Free users get 3 AI queries per user per trip. Explorer gets 25 AI queries per user per trip. Frequent Chraveler gets unlimited AI queries. A counter shows how many you have left. Each new trip starts fresh with your full query limit. Voice input to the AI concierge counts as a single query.',
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes! Upgrade, downgrade, or cancel anytime. No contracts, no hassles.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'All data is encrypted in transit and at rest. Row-level security ensures you only see trips you belong to. High Privacy mode adds end-to-end encryption for messages. Your trips are private unless you choose to share them.',
  },
  {
    question: 'Who pays for Pro — the concierge / planner or the client?',
    answer:
      'Either — or both. (1) A concierge company, wedding planner, tour manager, or corporate assistant can hold the Pro plan; every client trip they run uses their Pro Trip and Coordinator seats, and clients invited as Full Members join for free. (2) A couple, organization, or family office can hold Pro themselves for their own weekend/tour/retreat and invite outside help as **Coordinators** at no extra seat cost. (3) Both can pay independently — a frequent traveler’s personal subscription and their concierge’s Pro plan don’t conflict. Billing follows whoever created the Pro Trip.',
  },
  {
    question: 'Do all trip members need to pay?',
    answer:
      'No. Only the trip creator or organization admin pays. Invited members join for free, and Coordinators (outside planners, concierges, assistants) don’t need their own paid seat when they help run a Pro Trip.',
  },

  {
    question: "What's included with the free Pro Trip and events?",
    answer:
      "Every account gets 1 free ChravelApp Pro trip and up to 3 events to experience the platform. Need unlimited events? They're included with Frequent Chraveler — no separate events subscription required.",
  },
  {
    question: 'Are Events included in my subscription?',
    answer:
      'Yes — bundled into all paid plans. Free and Explorer accounts include up to 3 events, while Frequent Chraveler and Pro plans include unlimited events. Every plan supports events for large groups.',
  },
  {
    question: 'Why not just use the apps I already have?',
    answer:
      "Unlike your current stack where texts don't know what's in your emails, and your spreadsheet doesn't know what's in your group chat—ChravelApp's 8 tabs are fully interconnected. Your AI concierge can search your calendar, polls, and outstanding tasks, and more. One context-aware trip brain instead of 8 disconnected apps.",
  },
  {
    question: 'Why buy a Trip Pass instead of subscribing monthly?',
    answer:
      "Trip Passes are one-time purchases — no auto-renew, no cancel reminders, no card kept on file after checkout. Buy once, use it for the whole trip window (45 or 90 days), and you're done. Perfect for people who take a few trips a year and don't want a subscription running in the background. Your exports and trip data stay forever, even after the pass expires. If you travel every month, a monthly or annual subscription is the better deal.",
  },
];

const _testimonials = [
  {
    quote:
      'ChravelApp replaced 8 different apps we were using. Our team coordination improved by 300% and we save 15 hours per tour.',
    author: 'Sarah Chen',
    role: 'Tour Manager, Rising Stars Band',
    avatar: 'SC',
  },
  {
    quote:
      'The ROI was immediate. We cut our travel planning time by 70% and reduced coordination errors to zero.',
    author: 'Marcus Rodriguez',
    role: 'Operations Director, Global Corp',
    avatar: 'MR',
  },
  {
    quote:
      "Our family trips went from chaotic group chats to seamless experiences. Everyone knows what's happening when.",
    author: 'Jennifer Kim',
    role: 'Family Travel Coordinator',
    avatar: 'JK',
  },
];

export const PricingSection = ({ onSignUp }: PricingSectionProps = {}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [activeTab, setActiveTab] = useState<'consumer' | 'pro' | 'pass'>('consumer');
  const [_openFaq, _setOpenFaq] = useState<number | null>(null);
  const [tripPassOpen, setTripPassOpen] = useState(false);
  const [passLoading, setPassLoading] = useState<string | null>(null);

  const iosNative = isIOSNativeShell();

  const handlePassPurchase = async (passId: string) => {
    setPassLoading(passId);
    try {
      if (iosNative) {
        const { purchaseTripPass } = await import('@/integrations/revenuecat/revenuecatClient');
        const tier: 'explorer' | 'frequent-chraveler' =
          passId === 'pass-explorer-45' ? 'explorer' : 'frequent-chraveler';
        const result = await purchaseTripPass(tier);
        if (result.success) {
          toast.success('Trip Pass activated!');
        } else if (result.errorCode === 'CANCELLED') {
          // silent
        } else if (!result.supported) {
          toast.error('In-app purchases are not available on this device.');
        } else {
          toast.error(result.error || 'Failed to purchase Trip Pass.');
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to purchase a Trip Pass');
        if (onSignUp) onSignUp();
        return;
      }
      const billingPlatform =
        typeof navigator === 'undefined'
          ? 'web'
          : detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView());
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier: passId, purchase_type: 'pass', platform: billingPlatform },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err) {
      console.error('Trip Pass checkout error:', err);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setPassLoading(null);
    }
  };

  const tripPassTiers: PricingTier[] = [
    {
      id: 'pass-explorer-45',
      name: 'Explorer Trip Pass',
      price: TRIP_PASS_DISPLAY.explorer.price,
      description: `One trip, done. ${TRIP_PASS_DISPLAY.explorer.durationDays} days of Explorer features — no subscription, no cancel reminders, no card kept on file.`,
      icon: <Globe size={24} />,
      features: [
        `${TRIP_PASS_DISPLAY.explorer.durationDays}-day access window`,
        'One-time purchase — no auto-renew',
        'Unlimited saved trips + restore archived',
        '25 AI queries per user per trip',
        'More PDF Recap exports',
        'Smart Import (Calendar, Agenda, Line-up from URL)',
        'ICS calendar export',
        'Preference-aware AI recommendations',
      ],
      cta: passLoading === 'pass-explorer-45' ? 'Starting checkout…' : 'Get Explorer Pass',
      category: 'consumer',
      badge: 'One-time · No renewal',
      ctaAction: () => handlePassPurchase('pass-explorer-45'),
    },
    {
      id: 'pass-frequent-90',
      name: 'Frequent Chraveler Trip Pass',
      price: TRIP_PASS_DISPLAY['frequent-chraveler'].price,
      description: `${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days of the full Frequent Chraveler experience. Double the window, more features, less than double the price of the Explorer pass.`,
      icon: <Crown size={24} />,
      features: [
        `${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays}-day access window (best value per day)`,
        'One-time purchase — no auto-renew',
        'Everything in Explorer Trip Pass',
        'Unlimited AI queries (24/7 concierge)',
        'Smart Import (URL, paste, or file)',
        'Role-based channels & Pro features',
        'Custom trip categories',
        'Early feature access',
      ],
      cta: passLoading === 'pass-frequent-90' ? 'Starting checkout…' : 'Get Frequent Pass',
      category: 'consumer',
      popular: true,
      badge: 'Best value · Multi-city',
      ctaAction: () => handlePassPurchase('pass-frequent-90'),
    },
  ];

  const handlePlanSelect = (planId: string, tier?: PricingTier) => {
    // If tier has custom action, use it
    if (tier?.ctaAction) {
      tier.ctaAction();
      return;
    }

    // For consumer plans, trigger sign-up modal
    if (activeTab === 'consumer' && onSignUp) {
      onSignUp();
    }
  };

  const getCurrentTiers = () => {
    switch (activeTab) {
      case 'consumer':
        return consumerTiers;
      case 'pro':
        return proTiers;
      case 'pass':
        return tripPassTiers;
      default:
        return consumerTiers;
    }
  };

  const getPrice = (tier: PricingTier) => {
    if (tier.annualPrice && billingCycle === 'annual') {
      return tier.annualPrice;
    }
    return tier.price;
  };

  const getAnnualMonthlyEquivalent = (tier: PricingTier) => {
    if (!tier.annualPrice || billingCycle !== 'annual') return null;
    const annual = parseFloat(tier.annualPrice.replace('$', ''));
    return `$${(annual / 12).toFixed(2)}/month`;
  };

  return (
    <div className="w-full space-y-16">
      {/* Header with Value Prop */}
      <div className="text-center">
        {/* Why Upgrade Section */}
        {activeTab === 'consumer' && (
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 tablet:p-8 max-w-5xl mx-auto">
            <h3 className="text-xl sm:text-2xl tablet:text-3xl font-bold text-foreground mb-3">
              Why Upgrade?
            </h3>
            <p className="text-base sm:text-lg tablet:text-xl font-semibold text-white">
              Start free. Upgrade when you're ready for relief.
            </p>
            <p className="text-sm sm:text-base text-white/70 mt-1 max-w-2xl mx-auto">
              Don't lose receipts, links, or the final plan. Free works forever—upgrade only when
              you need more.
            </p>
            <div
              className="mx-auto my-4 h-px w-16 bg-gradient-to-r from-transparent via-[#c49746] to-transparent"
              aria-hidden="true"
            />
            <div className="grid grid-cols-1 tablet:grid-cols-2 lg:grid-cols-3 gap-3 tablet:gap-4">
              {valuePropItems.map((item, index) => (
                <div key={index} className="text-left">
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="text-primary mt-0.5">
                      {React.cloneElement(item.icon as React.ReactElement, {
                        size: 16,
                      })}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm sm:text-base md:text-lg mb-1 break-words">
                        {item.title}
                      </h4>
                      <p className="text-xs sm:text-sm md:text-base text-foreground break-words">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex justify-center">
          <div className="bg-card/50 rounded-lg p-1 flex gap-1 flex-wrap">
            {[
              { id: 'consumer', label: 'ChravelApp Plus', icon: <Users size={16} /> },
              { id: 'pro', label: 'ChravelApp Pro', icon: <Building size={16} /> },
              { id: 'pass', label: 'Trip Passes', icon: <Ticket size={16} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 tablet:px-6 tablet:py-3 rounded-md text-sm sm:text-base tablet:text-lg font-medium transition-all flex items-center gap-1.5 tablet:gap-2 ${
                  activeTab === tab.id
                    ? 'accent-fill-gold font-semibold shadow-sm'
                    : 'text-foreground hover:text-foreground'
                }`}
              >
                {React.cloneElement(tab.icon as React.ReactElement, {
                  size: 14,
                })}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Billing Toggle for applicable plans */}
        {activeTab === 'consumer' && (
          <div className="flex items-center justify-center gap-3 md:gap-4">
            <span
              className={`text-sm sm:text-base ${billingCycle === 'monthly' ? 'text-foreground font-medium' : 'text-foreground'}`}
            >
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
              className="relative w-12 h-6 bg-muted rounded-full transition-colors"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-gold-primary rounded-full transition-transform shadow-ring-glow ${
                  billingCycle === 'annual' ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-sm sm:text-base ${billingCycle === 'annual' ? 'text-foreground font-medium' : 'text-foreground'}`}
            >
              Annual
            </span>
            {billingCycle === 'annual' && (
              <Badge
                variant="secondary"
                className="border border-gold-primary/40 bg-gold-primary/10 text-gold-light text-xs"
              >
                Save 17%
              </Badge>
            )}
          </div>
        )}

        {/* Trip Pass helper note */}
        {activeTab === 'pass' && (
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground inline-flex items-center justify-center gap-1.5">
              <Clock size={14} className="text-primary" />
              One-time purchase. Full premium features for a fixed window. Your exports stay
              forever.
            </p>
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div
        className={`grid gap-4 tablet:gap-6 max-w-7xl mx-auto px-2 ${
          activeTab === 'consumer'
            ? 'grid-cols-1 lg:grid-cols-3'
            : activeTab === 'pass'
              ? 'grid-cols-1 md:grid-cols-2 max-w-4xl'
              : 'grid-cols-1 tablet:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {getCurrentTiers().map(tier => (
          <div key={tier.id}>
            <Card
              className={`relative backdrop-blur-sm border transition-all motion-safe:hover:-translate-y-1 hover:shadow-gold-glow min-h-[480px] flex flex-col ${
                tier.popular || tier.recommended
                  ? 'bg-card/80 border-gold-primary/50 shadow-lg ring-1 ring-gold-primary/20'
                  : tier.enterprise
                    ? 'bg-card/80 border-gold-primary/30'
                    : 'bg-card/80 border-border/50'
              }`}
            >
              {(tier.popular || tier.recommended) && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="accent-fill-gold px-4 py-2 font-semibold">
                    {tier.badge || 'Most Popular'}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4 tablet:pb-6 p-4 tablet:p-6">
                <div
                  className={`w-12 h-12 tablet:w-16 tablet:h-16 mx-auto rounded-full flex items-center justify-center mb-3 tablet:mb-4 ${
                    tier.popular || tier.recommended
                      ? 'bg-primary/20 text-primary'
                      : tier.enterprise
                        ? 'bg-accent/20 text-accent'
                        : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {React.cloneElement(tier.icon as React.ReactElement, {
                    size: 20,
                  })}
                </div>
                <CardTitle className="text-xl md:text-2xl mb-2 font-bold break-words whitespace-normal">
                  {tier.name}
                </CardTitle>
                <div className="space-y-2">
                  <div className="break-words whitespace-normal overflow-hidden text-center">
                    <div className="text-3xl md:text-4xl font-bold text-foreground">
                      {getPrice(tier)}
                    </div>
                    {/* Pro monthly pricing */}
                    {tier.category === 'pro' &&
                      tier.price.includes('$') &&
                      !tier.price.includes('Starting') && (
                        <div className="text-sm sm:text-base md:text-lg text-foreground font-normal mt-1">
                          /month
                        </div>
                      )}
                    {/* Consumer monthly/annual pricing */}
                    {tier.category === 'consumer' &&
                      tier.annualPrice &&
                      billingCycle === 'monthly' && (
                        <div className="text-sm sm:text-base md:text-lg text-foreground font-normal mt-1">
                          /month
                        </div>
                      )}
                    {tier.category === 'consumer' &&
                      tier.annualPrice &&
                      billingCycle === 'annual' && (
                        <div className="text-sm sm:text-base md:text-lg text-foreground font-normal mt-1">
                          /year
                        </div>
                      )}
                  </div>

                  {/* Show monthly equivalent for annual plans */}
                  {billingCycle === 'annual' &&
                    tier.annualPrice &&
                    tier.category === 'consumer' &&
                    getAnnualMonthlyEquivalent(tier) && (
                      <div className="text-sm text-muted-foreground break-words whitespace-normal text-center px-2">
                        {getAnnualMonthlyEquivalent(tier)} when billed annually
                      </div>
                    )}

                  {/* Show original price and savings */}
                  {tier.originalPrice && billingCycle === 'annual' && (
                    <div className="text-sm text-muted-foreground line-through break-words whitespace-normal text-center">
                      Originally {tier.originalPrice}/year
                    </div>
                  )}

                  {tier.savings && billingCycle === 'annual' && (
                    <div className="text-sm text-gold-light font-medium break-words whitespace-normal text-center">
                      {tier.savings}
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground min-h-[2.5rem] flex items-center justify-center break-words whitespace-normal overflow-hidden text-center px-2">
                    {tier.description}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 tablet:space-y-4 px-4 tablet:px-6 pb-4 tablet:pb-6 flex-1">
                {tier.limitation && (
                  <div className="bg-gold-primary/10 border border-gold-primary/20 rounded-lg p-2.5 tablet:p-3 text-sm text-gold-primary break-words font-medium">
                    {tier.limitation}
                  </div>
                )}

                <ul className="space-y-2.5 tablet:space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <Check size={16} className="text-gold-primary mt-0.5 flex-shrink-0" />
                      <span className="text-base font-semibold text-foreground break-words">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="px-4 tablet:px-6 pb-4 tablet:pb-6 pt-0 mt-auto">
                <Button
                  onClick={tier.ctaAction || (() => handlePlanSelect(tier.id))}
                  className={`w-full h-10 tablet:h-12 font-semibold text-sm sm:text-base ${
                    tier.category === 'consumer'
                      ? 'accent-fill-gold'
                      : tier.enterprise
                        ? 'accent-fill-gold'
                        : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          </div>
        ))}
      </div>

      {/* Trip Pass Modal */}
      <TripPassModal open={tripPassOpen} onOpenChange={setTripPassOpen} />
    </div>
  );
};
