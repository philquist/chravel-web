export function normalizeSubscriptionTierForCheckout(tier: string): string {
  const normalizedTier = tier.replace(/^consumer-/, '');
  return normalizedTier === 'pro-growing' ? 'pro-growth' : normalizedTier;
}

export function shouldBlockConsumerStripeCheckout(platform: string, userAgent: string): boolean {
  const nativeShellUserAgent = /ChravelNative\/|; wv\)|Capacitor/i.test(userAgent);
  return platform !== 'web' || nativeShellUserAgent;
}

export function isConsumerDigitalGoodsCheckout(tier: string, purchaseType: string): boolean {
  return (
    purchaseType === 'pass' ||
    tier === 'explorer' ||
    tier === 'frequent-chraveler' ||
    tier === 'consumer-explorer' ||
    tier === 'consumer-frequent-chraveler'
  );
}
