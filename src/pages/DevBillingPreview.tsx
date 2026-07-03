/**
 * Dev-only preview page for capturing App Store IAP review screenshots.
 * Renders the exact ConsumerBillingSection UI without auth-gating.
 * Query params drive state so Playwright can reach each capture deterministically.
 *
 * NOT linked in production navigation. Safe to remove after screenshots are captured.
 */
import React from 'react';
import { ConsumerBillingSection } from '@/components/consumer/ConsumerBillingSection';
import { TripPassModal } from '@/components/conversion/TripPassModal';

export default function DevBillingPreview() {
  const params = new URLSearchParams(window.location.search);
  const showTripPass = params.get('trippass') === '1';

  return (
    <div
      className="min-h-screen bg-background text-foreground p-4 pb-24"
      data-testid="dev-billing-preview"
    >
      <h1 className="text-lg font-bold text-white mb-4">Billing</h1>
      <ConsumerBillingSection />
      <TripPassModal
        open={showTripPass}
        onOpenChange={() => {
          /* no-op */
        }}
      />
    </div>
  );
}
