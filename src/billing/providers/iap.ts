/**
 * Apple In-App Purchase Provider
 *
 * ⚠️ SCAFFOLD ONLY - NOT FULLY IMPLEMENTED
 *
 * This file provides the structure for Apple IAP integration.
 * Full implementation lives in the chravel-mobile repo (native iOS).
 * This scaffold remains for the billing provider interface.
 *
 * Requirements for full implementation:
 *
 * 1. Configure products in App Store Connect:
 *    - com.chravel.explorer.monthly
 *    - com.chravel.explorer.annual
 *    - com.chravel.frequentchraveler.monthly
 *    - com.chravel.frequentchraveler.annual
 *
 * 3. Add App Store Connect shared secret to Edge Function secrets
 *
 * 4. Implement receipt validation Edge Function:
 *    - Validate receipt with Apple
 *    - Update user entitlements in Supabase
 *    - Handle subscription renewals/cancellations
 *
 * 5. Handle StoreKit 2 server notifications for subscription events
 *
 * IMPORTANT: Consumer subscriptions MUST use IAP on iOS per App Store guidelines.
 * Pro/Enterprise plans can use external payment (B2B exception).
 */

import { BaseBillingProvider } from './base';
import { BILLING_PRODUCTS, BILLING_FLAGS } from '../config';
import { getEntitlements } from '../entitlements';
import type {
  BillingPlatform,
  Product,
  PurchaseRequest,
  PurchaseResult,
  UserEntitlements,
  SubscriptionTier,
} from '../types';

export class AppleIAPProvider extends BaseBillingProvider {
  readonly platform: BillingPlatform = 'ios';
  readonly name = 'AppleIAP';

  // TODO: Native IAP initialization lives in chravel-mobile

  isAvailable(): boolean {
    // Check if IAP is enabled via feature flag
    if (!BILLING_FLAGS.APPLE_IAP_ENABLED) {
      this.log('Apple IAP is disabled via feature flag');
      return false;
    }

    return false;
  }

  async getProducts(): Promise<Product[]> {
    if (!this.isAvailable()) {
      this.log('IAP not available, returning empty products');
      return [];
    }

    // For now, return config-based products
    return Object.entries(BILLING_PRODUCTS)
      .filter(([key]) => key.startsWith('consumer-'))
      .map(([key, config]) => ({
        id: config.appleProductIdMonthly || key,
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
      // IAP not available - prompt user to subscribe on web
      if (BILLING_FLAGS.SHOW_WEB_SUBSCRIBE_PROMPT) {
        return {
          success: false,
          error: 'Please subscribe on our website at chravel.app',
          errorCode: 'SUBSCRIBE_ON_WEB',
        };
      }

      return {
        success: false,
        error: 'In-app purchases are not available',
        errorCode: 'IAP_NOT_AVAILABLE',
      };
    }

    return {
      success: false,
      error: 'Apple IAP not implemented',
      errorCode: 'IAP_NOT_AVAILABLE',
    };
  }

  async restorePurchases(): Promise<UserEntitlements | null> {
    this.log('Restore purchases requested');

    if (!this.isAvailable()) {
      this.log('IAP not available, cannot restore');
      return null;
    }

    return null;
  }

  async openManagement(): Promise<void> {
    this.log('Opening iOS subscription settings');

    // Deep link to iOS subscription settings
    const url = 'itms-apps://apps.apple.com/account/subscriptions';

    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }

  async verifyEntitlements(userId: string): Promise<UserEntitlements> {
    this.log('Verifying entitlements for user', userId);

    // Entitlements are validated and stored on the backend (e.g. via Edge Functions
    // listening to App Store Server Notifications). The client simply queries the backend.
    return getEntitlements(userId);
  }
}

/**
 * Implementation Checklist (native iOS — see chravel-mobile repo):
 *
 * □ Configure products in App Store Connect
 *   - Create subscription group "Chravel Consumer"
 *   - Add products (prices are source-of-truth from src/billing/config.ts):
 *     - com.chravel.explorer.monthly ($9.99/mo)
 *     - com.chravel.explorer.annual ($99/yr)
 *     - com.chravel.frequentchraveler.monthly ($19.99/mo)
 *     - com.chravel.frequentchraveler.annual ($199/yr)
 *
 * □ Add shared secret to Edge Function secrets
 *   APPLE_SHARED_SECRET=<from App Store Connect>
 *
 * □ Create validate-apple-receipt Edge Function
 *   - Receive receipt from client
 *   - Validate with Apple verifyReceipt endpoint
 *   - Update user subscription in Supabase
 *   - Return entitlements
 *
 * □ Configure App Store Server Notifications
 *   - Point to Edge Function webhook
 *   - Handle: SUBSCRIBED, DID_RENEW, DID_CHANGE_RENEWAL_STATUS, etc.
 *
 * □ Test in sandbox
 *   - Create sandbox test users
 *   - Test purchase flow
 *   - Test restore flow
 *   - Test subscription expiry
 *
 * □ Set BILLING_FLAGS.APPLE_IAP_ENABLED = true
 *
 * □ Submit for App Review
 */
