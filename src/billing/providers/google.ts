/**
 * Google Play Billing Provider
 *
 * ⚠️ SCAFFOLD ONLY - NOT FULLY IMPLEMENTED
 *
 * This file provides the structure for Google Play Billing integration.
 * Full implementation lives in the chravel-mobile repo (native Android).
 * This scaffold remains for the billing provider interface.
 */

import { BaseBillingProvider } from './base';
import { BILLING_PRODUCTS, BILLING_FLAGS } from '../config';
import { getEntitlements } from '../entitlements';
import { restorePurchases as restoreRevenueCatPurchases } from '@/integrations/revenuecat/revenuecatClient';
import { supabase } from '@/integrations/supabase/client';
import type {
  BillingPlatform,
  Product,
  PurchaseRequest,
  PurchaseResult,
  UserEntitlements,
  SubscriptionTier,
} from '../types';

export class GooglePlayProvider extends BaseBillingProvider {
  readonly platform: BillingPlatform = 'android';
  readonly name = 'GooglePlay';

  isAvailable(): boolean {
    if (!BILLING_FLAGS.GOOGLE_BILLING_ENABLED) {
      this.log('Google Play Billing is disabled via feature flag');
      return false;
    }

    return true;
  }

  async getProducts(): Promise<Product[]> {
    if (!this.isAvailable()) {
      this.log('Google Play Billing not available, returning empty products');
      return [];
    }

    // For now, return config-based products
    return Object.entries(BILLING_PRODUCTS)
      .filter(([key]) => key.startsWith('consumer-'))
      .map(([key, config]) => ({
        id: config.googleProductIdMonthly || key,
        name: config.name,
        description: `${config.name} subscription`,
        priceMonthly: config.priceMonthly,
        priceAnnual: config.priceAnnual,
        currency: 'USD',
        tier: key.includes('explorer')
          ? ('explorer' as SubscriptionTier)
          : ('frequent-chraveler' as SubscriptionTier),
        entitlements: config.entitlements,
      }));
  }

  async purchase(request: PurchaseRequest): Promise<PurchaseResult> {
    this.log('Purchase requested', request);

    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Google Play Billing is not available yet. Please update the app and try again.',
        errorCode: 'IAP_NOT_AVAILABLE',
      };
    }

    // TODO: Implement actual purchase flow
    //
    // const product = this.getGoogleProductId(request.tier, request.billingCycle);
    //
    // try {
    //   const result = await InAppPurchases.purchaseProduct({ productId: product });
    //
    //   if (result.transactionState === 'purchased') {
    //     // Send receipt to server for validation
    //     const validation = await this.validateReceipt(result.receipt);
    //
    //     if (validation.success) {
    //       return {
    //         success: true,
    //         transactionId: result.transactionId,
    //         entitlements: validation.entitlements,
    //       };
    //     }
    //   }
    // } catch (error) {
    //   if (error.code === 'USER_CANCELLED') {
    //     return { success: false, error: 'Purchase cancelled', errorCode: 'CANCELLED' };
    //   }
    //   throw error;
    // }

    return {
      success: false,
      error: 'Google Play Billing not implemented',
      errorCode: 'IAP_NOT_AVAILABLE',
    };
  }

  /**
   * Get Google product ID for a tier and billing cycle
   */
  private getGoogleProductId(
    tier: SubscriptionTier,
    billingCycle: 'monthly' | 'annual',
  ): string | null {
    const productKey =
      tier === 'explorer'
        ? 'consumer-explorer'
        : tier === 'frequent-chraveler'
          ? 'consumer-frequent-chraveler'
          : null;

    if (!productKey) return null;

    const product = BILLING_PRODUCTS[productKey];
    if (!product) return null;

    return billingCycle === 'annual'
      ? product.googleProductIdAnnual || null
      : product.googleProductIdMonthly || null;
  }

  async restorePurchases(): Promise<UserEntitlements | null> {
    this.log('Restore purchases requested');

    if (!this.isAvailable()) {
      this.log('Google Play Billing not available, cannot restore');
      return null;
    }

    try {
      this.log('Initiating native restore via RevenueCat');

      // Attempt to trigger a native restore through RevenueCat if available in the context
      const restoreResult = await restoreRevenueCatPurchases(false);

      if (restoreResult.success && restoreResult.data) {
        this.log('Native restore successful, syncing entitlements to backend');
        // Sync the freshly restored info back to our backend
        const syncResult = await supabase.functions.invoke('sync-revenuecat-entitlement', {
          body: { customerInfo: restoreResult.data },
        });

        if (syncResult.error) {
          this.logError('Failed to sync restored entitlements', syncResult.error);
        }
      } else {
        this.log(
          'Native restore skipped or failed, falling back to backend fetch',
          restoreResult.error,
        );
      }

      // Whether the native restore succeeded or we're just falling back,
      // we return the canonical entitlements from our backend
      this.log('Delegating restore verification to backend');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('User not authenticated');

      return await getEntitlements(user.id);
    } catch (error) {
      this.logError('Restore failed', error);
      return null;
    }
  }

  async openManagement(): Promise<void> {
    this.log('Opening Google Play subscription settings');

    const url = 'https://play.google.com/store/account/subscriptions';

    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }

  async verifyEntitlements(userId: string): Promise<UserEntitlements> {
    this.log('Verifying entitlements for user', userId);

    // Entitlements are validated and stored on the backend. The client simply queries the backend.
    return getEntitlements(userId);
  }
}
