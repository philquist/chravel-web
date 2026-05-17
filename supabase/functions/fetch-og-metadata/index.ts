/**
 * Fetch OG Metadata Edge Function
 *
 * Fetches Open Graph metadata from URLs to avoid CORS issues
 * Used by Media > URLs tab to show rich previews
 *
 * @module supabase/functions/fetch-og-metadata
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  FetchOGMetadataSchema,
  validateInput,
  validateExternalUrlBeforeFetch,
} from '../_shared/validation.ts';

interface OGMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  url?: string;
  error?: string;
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate request body with Zod schema (SSRF protection)
    const rawBody = await req.json();
    const validation = validateInput(FetchOGMetadataSchema, rawBody);

    if (!validation.success) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { url } = validation.data;

    // DNS rebinding protection: resolve hostname and validate resolved IPs
    if (!(await validateExternalUrlBeforeFetch(url))) {
      return new Response(
        JSON.stringify({ error: 'URL must be HTTPS and external (no internal/private networks)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Follow redirects manually with per-hop SSRF validation.
    // Using redirect: 'manual' instead of 'follow' ensures every redirect target
    // is validated against the SSRF blocklist (private IPs, localhost, link-local).
    // Using 'error' was too strict — it blocked legitimate redirects (www normalization, CDN routing).
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let response!: Response;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChravelBot/1.0; +https://chravel.com)',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });

      // Not a redirect — done
      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect with no Location header');

      // Resolve relative redirect URLs against current URL
      currentUrl = new URL(location, currentUrl).toString();

      // SSRF gate: validate every redirect hop against the blocklist
      if (!(await validateExternalUrlBeforeFetch(currentUrl))) {
        throw new Error('Redirect target failed SSRF validation');
      }

      if (hop === MAX_REDIRECTS) {
        throw new Error('Too many redirects');
      }
    }

    if (!response.ok) {
      // Treat all upstream failures as fallbackable — the client should degrade
      // gracefully (show plain URL) rather than throw. 403/404 commonly occur from
      // bot-blocking sites or malformed user-pasted URLs (trailing punctuation).
      const isFallbackable = true;
      console.error(`[fetch-og-metadata] HTTP ${response.status}: ${response.statusText}`);
      return new Response(
        JSON.stringify({
          error: isFallbackable
            ? 'SERVICE_UNAVAILABLE'
            : `HTTP ${response.status}: ${response.statusText}`,
          fallback: isFallbackable,
          url,
        }),
        {
          status: isFallbackable ? 200 : response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const html = await response.text();
    const metadata: OGMetadata = {};

    const matchOgTag = (tag: string): RegExpMatchArray | null =>
      html.match(new RegExp(`<meta\\s+property=["']${tag}["']\\s+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${tag}["']`, 'i'));

    const matchNameTag = (name: string): RegExpMatchArray | null =>
      html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${name}["']`, 'i'));

    const ogTitleMatch =
      matchOgTag('og:title') ||
      matchNameTag('twitter:title') ||
      html.match(/<title>([^<]+)<\/title>/i);
    if (ogTitleMatch) metadata.title = ogTitleMatch[1].trim();

    const ogDescriptionMatch =
      matchOgTag('og:description') ||
      matchNameTag('twitter:description') ||
      matchNameTag('description');
    if (ogDescriptionMatch) metadata.description = ogDescriptionMatch[1].trim();

    const ogImageMatch = matchOgTag('og:image') || matchNameTag('twitter:image');
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1].trim();
      metadata.image = imageUrl.startsWith('http') ? imageUrl : new URL(imageUrl, url).toString();
    }

    const ogSiteNameMatch = matchOgTag('og:site_name');
    if (ogSiteNameMatch) metadata.siteName = ogSiteNameMatch[1].trim();

    const ogTypeMatch = matchOgTag('og:type');
    if (ogTypeMatch) metadata.type = ogTypeMatch[1].trim();

    metadata.url = url;

    return new Response(JSON.stringify(metadata), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[fetch-og-metadata] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'SERVICE_FAILED',
        fallback: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
