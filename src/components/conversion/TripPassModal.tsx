import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Check, Globe, Crown, Clock, Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  detectNativeBillingPlatform,
  isIOSNativeShell,
  isNativeWebView,
} from '@/utils/platformDetection';
import { purchaseTripPass, handlePurchaseResult } from '@/integrations/revenuecat/revenuecatClient';
import { toast } from 'sonner';
import { CONSUMER_PRICE_DISPLAY, TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';

interface TripPassModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const passes = [
  {
    id: 'pass-explorer-45',
    tier: 'explorer',
    name: 'Explorer Trip Pass',
    duration: `${TRIP_PASS_DISPLAY.explorer.durationDays} days`,
    price: TRIP_PASS_DISPLAY.explorer.price,
    icon: <Globe size={24} />,
    description: 'One trip, done — no subscription, no cancel reminders.',
    features: [
      'One-time purchase — no auto-renew',
      'Unlimited saved trips + restore archived',
      '25 AI queries per user per trip',
      'Unlimited PDF exports',
      'Smart Import (Calendar, Agenda, Line-up from URL)',
      'ICS calendar export',
      'Location-aware AI recommendations',
      'Search past trips and memories',
    ],
    nudge: `Travel monthly? Annual Explorer (${CONSUMER_PRICE_DISPLAY.explorer.annual}/yr) pays for itself after ~3 trips.`,
  },
  {
    id: 'pass-frequent-90',
    tier: 'frequent-chraveler',
    name: 'Frequent Chraveler Trip Pass',
    duration: `${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days`,
    price: TRIP_PASS_DISPLAY['frequent-chraveler'].price,
    icon: <Crown size={24} />,
    description: 'Double the window, more features, best value per day.',
    features: [
      'One-time purchase — no auto-renew',
      'Everything in Explorer Trip Pass',
      'Unlimited AI queries (24/7 concierge)',
      'Smart Import (Calendar, Agenda, Line-up from URL, paste, or file)',
      'Role-based channels & Pro features',
      'Custom trip categories',
      'Early feature access',
    ],
    nudge: `Travel monthly? Annual Frequent (${CONSUMER_PRICE_DISPLAY['frequent-chraveler'].annual}/yr) pays for itself after ~3 trips.`,
  },
];

export const TripPassModal: React.FC<TripPassModalProps> = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const iosNative = isIOSNativeShell();

  const handlePurchase = async (passId: string) => {
    setLoading(passId);
    try {
      // iOS native shell — Apple IAP via RevenueCat (Guideline 3.1.1)
      if (iosNative) {
        const tier: 'explorer' | 'frequent-chraveler' =
          passId === 'pass-explorer-45' ? 'explorer' : 'frequent-chraveler';
        const result = await purchaseTripPass(tier);
        handlePurchaseResult(result, {
          successMessage: 'Trip Pass activated!',
          successDescription: 'Premium features are unlocking now.',
          onRetry: () => void handlePurchase(passId),
          context: `trippass/${tier}`,
        });
        if (result.success) {
          onOpenChange(false);
        }
        return;
      }

      // Web / Android web shell — Stripe Checkout
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to purchase a Trip Pass');
        return;
      }

      const billingPlatform =
        typeof navigator === 'undefined'
          ? 'web'
          : detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView());
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          tier: passId,
          purchase_type: 'pass',
          platform: billingPlatform,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Trip Pass checkout error:', err);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-2xl font-bold text-center">
            <Ticket size={22} className="text-gold-primary" aria-hidden="true" />
            Trip Pass
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            One-time purchase. Full premium features for the whole trip window — no auto-renew, no
            card kept on file. Your exports stay forever.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {passes.map(pass => (
            <Card key={pass.id} className="bg-card/80 border-border/50 flex flex-col">
              <CardHeader className="text-center pb-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
                  {pass.icon}
                </div>
                <CardTitle className="text-lg font-bold">{pass.name}</CardTitle>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    <Clock size={12} className="mr-1" />
                    {pass.duration}
                  </Badge>
                </div>
                <div className="text-3xl font-bold text-foreground mt-2">
                  {pass.price}
                  <span className="text-sm font-normal text-muted-foreground ml-1">one-time</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{pass.description}</p>
              </CardHeader>

              <CardContent className="flex-1 px-4 pb-3">
                <ul className="space-y-2">
                  {pass.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col gap-2 px-4 pb-4">
                <Button
                  onClick={() => handlePurchase(pass.id)}
                  disabled={loading !== null}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {loading === pass.id ? (
                    <div className="h-4 w-4 mr-2 animate-spin gold-gradient-spinner" />
                  ) : null}
                  {iosNative ? 'Buy with Apple' : 'Get Trip Pass'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">{pass.nudge}</p>
              </CardFooter>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Most people choose Annual — pays for itself after ~3 trips.
        </p>
      </DialogContent>
    </Dialog>
  );
};
