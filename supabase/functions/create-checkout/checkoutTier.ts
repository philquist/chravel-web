export function normalizeSubscriptionTierForCheckout(tier: string): string {
  const normalizedTier = tier.replace(/^consumer-/, '');
  return normalizedTier === 'pro-growing' ? 'pro-growth' : normalizedTier;
}
