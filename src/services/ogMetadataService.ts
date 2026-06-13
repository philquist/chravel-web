/**
 * OG Metadata Service
 *
 * Fetches Open Graph metadata (title, description, image) for URLs
 * Used to enhance URL previews in Media > URLs tab
 *
 * @module services/ogMetadataService
 */

import {
  supabase,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_API_KEY,
} from '@/integrations/supabase/client';

export interface OGMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  url?: string;
  error?: string;
}

/**
 * Fetches OG metadata from a URL via the authenticated edge function.
 */
export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      return { error: 'Authentication required' };
    }

    const response = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/fetch-og-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLIC_API_KEY,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Categorizes a URL based on domain and metadata
 */
export function categorizeUrl(
  url: string,
  metadata?: OGMetadata,
): 'receipt' | 'schedule' | 'booking' | 'general' {
  const domain = new URL(url).hostname.toLowerCase();
  const title = metadata?.title?.toLowerCase() || '';
  const description = metadata?.description?.toLowerCase() || '';

  const receiptDomains = [
    'venmo.com',
    'paypal.com',
    'square.com',
    'stripe.com',
    'receipt',
    'invoice',
  ];
  const receiptKeywords = ['receipt', 'invoice', 'payment', 'paid', 'transaction', 'confirmation'];
  const scheduleDomains = ['calendar.google.com', 'outlook.com', 'calendly.com', 'doodle.com'];
  const scheduleKeywords = [
    'calendar',
    'schedule',
    'appointment',
    'meeting',
    'event',
    'reservation',
  ];
  const bookingDomains = [
    'airbnb.com',
    'booking.com',
    'expedia.com',
    'hotels.com',
    'kayak.com',
    'priceline.com',
    'tripadvisor.com',
    'opentable.com',
    'resy.com',
    'tock.com',
  ];
  const bookingKeywords = [
    'book',
    'reservation',
    'check-in',
    'check-out',
    'hotel',
    'flight',
    'restaurant',
  ];

  if (receiptDomains.some(d => domain.includes(d))) return 'receipt';
  if (scheduleDomains.some(d => domain.includes(d))) return 'schedule';
  if (bookingDomains.some(d => domain.includes(d))) return 'booking';

  const combinedText = `${title} ${description}`;
  if (receiptKeywords.some(k => combinedText.includes(k))) return 'receipt';
  if (scheduleKeywords.some(k => combinedText.includes(k))) return 'schedule';
  if (bookingKeywords.some(k => combinedText.includes(k))) return 'booking';

  return 'general';
}

/**
 * Batch fetch OG metadata for multiple URLs
 */
export async function batchFetchOGMetadata(
  urls: string[],
  concurrency: number = 3,
): Promise<Map<string, OGMetadata>> {
  const results = new Map<string, OGMetadata>();
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async url => ({ url, metadata: await fetchOGMetadata(url) })),
    );
    batchResults.forEach(({ url, metadata }) => results.set(url, metadata));
  }
  return results;
}
