import React, { useState } from 'react';
import {
  X,
  Building,
  Crown,
  Users,
  Shield,
  Star,
  BarChart3,
  Calendar,
  Wallet,
  Globe,
  Phone,
} from 'lucide-react';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { supabase } from '@/integrations/supabase/client';
import {
  detectNativeBillingPlatform,
  isIOSNativeShell,
  isNativeWebView,
} from '@/utils/platformDetection';
import {
  purchaseConsumerSubscription,
  purchaseProSubscription,
} from '@/integrations/revenuecat/revenuecatClient';
import { toast } from 'sonner';
import { CONSUMER_PRICE_DISPLAY, TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradeModal = ({ isOpen, onClose }: UpgradeModalProps) => {
  const [selectedPlan, setSelectedPlan] = useState<
    'explorer' | 'frequent-chraveler' | 'travel-pro'
  >('explorer');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const { upgradeToTier, isLoading } = useConsumerSubscription();

  if (!isOpen) return null;

  // When a consumer plan is selected, this is the typed key for pricing lookups.
  // (`selectedPlan` also allows 'travel-pro', which is not a consumer pricing tier.)
  const consumerPlan: 'explorer' | 'frequent-chraveler' =
    selectedPlan === 'frequent-chraveler' ? 'frequent-chraveler' : 'explorer';

  const iosNative = isIOSNativeShell();

  const handleUpgrade = async () => {
    // iOS native shell — Apple IAP via RevenueCat for every plan (Guideline 3.1.1)
    if (iosNative) {
      if (selectedPlan === 'travel-pro') {
        const result = await purchaseProSubscription('pro-starter', 'monthly');
        if (result.success) {
          toast.success('ChravelApp Pro activated!');
          onClose();
        } else if (result.errorCode === 'CANCELLED') {
          // silent
        } else if (!result.supported) {
          toast.error('In-app purchases are not available on this device.');
        } else {
          toast.error(result.error || 'Failed to start purchase.');
        }
        return;
      }
      const result = await purchaseConsumerSubscription(
        selectedPlan as 'explorer' | 'frequent-chraveler',
        billingCycle,
      );
      if (result.success) {
        toast.success('Subscription activated!');
        onClose();
      } else if (result.errorCode === 'CANCELLED') {
        // silent
      } else if (!result.supported) {
        toast.error('In-app purchases are not available on this device.');
      } else {
        toast.error(result.error || 'Failed to start purchase.');
      }
      return;
    }

    if (['explorer', 'frequent-chraveler'].includes(selectedPlan)) {
      await upgradeToTier(selectedPlan as 'explorer' | 'frequent-chraveler', billingCycle);
      onClose();
    } else if (selectedPlan === 'travel-pro') {
      // Handle Travel Pro upgrade - use Pro Starter by default
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            tier: 'pro-starter',
            platform: detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView()),
          },
        });

        if (error) throw error;

        if (data.url) {
          window.open(data.url, '_blank');
          onClose();
        }
      } catch (error) {
        console.error('Error creating checkout:', error);
        toast.error('Failed to start checkout');
      }
    }
  };

  return (
    <div className="modal-backdrop z-50 flex items-center justify-center p-4">
      <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-enterprise-lg p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-white">Choose Your Plan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Plan Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-2xl p-2 flex gap-1">
            <button
              onClick={() => setSelectedPlan('explorer')}
              className={`px-3 py-2 rounded-xl font-medium transition-all flex items-center gap-2 text-sm ${
                selectedPlan === 'explorer'
                  ? 'bg-gradient-to-r from-gold-primary to-gold-mid text-primary-foreground'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Globe size={16} />
              Explorer
            </button>
            <button
              onClick={() => setSelectedPlan('frequent-chraveler')}
              className={`px-3 py-2 rounded-xl font-medium transition-all flex items-center gap-2 text-sm ${
                selectedPlan === 'frequent-chraveler'
                  ? 'bg-gradient-to-r from-primary to-primary/80 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Crown size={16} />
              Frequent Chraveler
            </button>
            <button
              onClick={() => setSelectedPlan('travel-pro')}
              className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                selectedPlan === 'travel-pro'
                  ? 'bg-gradient-to-r from-primary to-primary/80 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Building size={18} />
              ChravelApp Pro
            </button>
          </div>
        </div>

        {/* Plan Content */}
        {['explorer', 'frequent-chraveler'].includes(selectedPlan) ? (
          <div>
            {/* Tier Info */}
            <div className="text-center mb-8">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  selectedPlan === 'explorer'
                    ? 'bg-gradient-to-r from-gold-primary to-gold-mid'
                    : 'bg-gradient-to-r from-primary to-primary/80'
                }`}
              >
                {selectedPlan === 'explorer' && (
                  <Globe size={32} className="text-primary-foreground" />
                )}
                {selectedPlan === 'frequent-chraveler' && (
                  <Crown size={32} className="text-primary-foreground" />
                )}
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 capitalize">
                {selectedPlan === 'frequent-chraveler' ? 'Frequent Chraveler' : selectedPlan}
              </h3>
              <p className="text-gray-300">
                {selectedPlan === 'explorer' && 'Never lose a trip memory'}
                {selectedPlan === 'frequent-chraveler' &&
                  'For travel pros and adventure enthusiasts'}
              </p>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <span
                className={`text-sm ${billingCycle === 'monthly' ? 'text-white font-medium' : 'text-gray-400'}`}
              >
                Monthly
              </span>
              <button
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
                className="relative w-12 h-6 bg-gray-700 rounded-full transition-colors"
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-primary rounded-full transition-transform ${
                    billingCycle === 'annual' ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
              <span
                className={`text-sm ${billingCycle === 'annual' ? 'text-white font-medium' : 'text-gray-400'}`}
              >
                Annual
              </span>
              {billingCycle === 'annual' && (
                <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded-lg text-xs font-medium">
                  Save 17%
                </div>
              )}
            </div>

            {/* Pricing */}
            <div className="text-center">
              <div className="bg-gradient-to-r from-gold-primary/20 to-gold-mid/20 backdrop-blur-sm border border-primary/30 rounded-2xl p-6 mb-6">
                <div className="text-4xl font-bold text-white mb-2">
                  {billingCycle === 'monthly'
                    ? CONSUMER_PRICE_DISPLAY[consumerPlan].monthly
                    : CONSUMER_PRICE_DISPLAY[consumerPlan].annual}
                  {billingCycle === 'monthly' ? '/month' : '/year'}
                </div>
                {billingCycle === 'annual' && (
                  <>
                    <div className="text-sm text-gray-300 mb-1">
                      {CONSUMER_PRICE_DISPLAY[consumerPlan].annualPerMonth}/month when billed
                      annually
                    </div>
                    <div className="text-green-400 text-sm mb-2">
                      {CONSUMER_PRICE_DISPLAY[consumerPlan].annualSavingsLabel} (
                      {CONSUMER_PRICE_DISPLAY[consumerPlan].annualSavingsPct}% off)
                    </div>
                  </>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  Or get a Trip Pass: {TRIP_PASS_DISPLAY[consumerPlan].label}
                </p>
                <p className="text-gray-300 mb-4">14-day free trial • Cancel anytime</p>
              </div>
            </div>

            {/* Features */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <h4 className="text-lg font-bold text-white mb-4">What's Included:</h4>
              <ul className="space-y-3 text-sm text-gray-300">
                {selectedPlan === 'explorer' && (
                  <>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Unlimited saved trips - keep every memory forever
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      25 AI queries per user per trip
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Location-aware AI suggestions
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Smart notifications - never miss important updates
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Search past trips - find that perfect restaurant again
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Up to 3 events (upgrade to Frequent Chraveler for unlimited)
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Priority support
                    </li>
                  </>
                )}
                {selectedPlan === 'frequent-chraveler' && (
                  <>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Everything in Explorer
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Unlimited AI queries
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Calendar sync & PDF export
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Unlimited events
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Create 1 ChravelApp Pro trip per month (50-seat limit)
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Role-based channels on Pro trips
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      Early feature access
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building size={32} className="text-black" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">ChravelApp Pro</h3>
              <p className="text-gray-300">Enterprise software for professional trip management</p>
            </div>

            {/* Pro Features - Full descriptions restored */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Users size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Advanced Team Collaboration</h4>
                <p className="text-gray-300 text-sm">
                  Comprehensive team management with role-based permissions, collaborative planning
                  tools, and real-time synchronization across all team members.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Wallet size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Enterprise Budget Management</h4>
                <p className="text-gray-300 text-sm">
                  Comprehensive expense tracking, budget allocation, automated approval workflows,
                  and detailed financial reporting with export capabilities.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <BarChart3 size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">
                  Analytics & Business Intelligence
                </h4>
                <p className="text-gray-300 text-sm">
                  Detailed trip analytics, sentiment analysis, performance metrics, ROI tracking,
                  and customizable dashboards for data-driven decision making.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Phone size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">24/7 Priority Support</h4>
                <p className="text-gray-300 text-sm">
                  Dedicated account management, priority technical support, custom integrations, and
                  enterprise-grade SLA guarantees.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Shield size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">
                  Enterprise Security & Compliance
                </h4>
                <p className="text-gray-300 text-sm">
                  Advanced security features, SSO integration, audit trails, GDPR compliance, and
                  enterprise-grade data protection standards.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Globe size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Multi-Organization Management</h4>
                <p className="text-gray-300 text-sm">
                  Manage multiple organizations, white-label options, custom branding, and scalable
                  seat-based pricing for enterprise deployments.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Calendar size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">
                  Advanced Scheduling & Automation
                </h4>
                <p className="text-gray-300 text-sm">
                  Automated itinerary generation, smart scheduling optimization, calendar
                  integrations, and workflow automation for complex travel operations.
                </p>
              </div>

              <div className="bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-2xl p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center mb-4">
                  <Star size={24} className="text-yellow-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">
                  Custom Integrations & API Access
                </h4>
                <p className="text-gray-300 text-sm">
                  REST API access, custom integrations with existing systems, webhook support, and
                  developer resources for seamless enterprise integration.
                </p>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-gradient-to-r from-primary/15 to-primary/20 backdrop-blur-sm border border-primary/30 rounded-2xl p-6 mb-6">
                <div className="text-4xl font-bold text-white mb-2">Start Trial</div>
                <p className="text-gray-300 mb-2">
                  Custom pricing available for large scale events, contact sales for more
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleUpgrade}
            disabled={isLoading}
            className="px-8 py-3 bg-gradient-to-r from-gold-primary to-gold-mid hover:from-gold-mid hover:to-gold-primary text-primary-foreground font-medium rounded-2xl transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : iosNative ? 'Subscribe with Apple' : 'Start Free Trial'}
          </button>
        </div>
      </div>
    </div>
  );
};
