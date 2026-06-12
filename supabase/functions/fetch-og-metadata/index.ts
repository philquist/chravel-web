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
import { requireAuth } from '../_shared/requireAuth.ts';
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

// Exported for testing. Handles common paste artifacts: markdown link syntax,
// surrounding quotes/brackets, HTML entities, and trailing punctuation.
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};
const decodeHtmlEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, m => HTML_ENTITIES[m] ?? m);

export const sanitizeUrl = (raw: string): string => {
  let u = raw.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['“', '”'],
    ['‘', '’'],
    ['«', '»'],
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ];

  // Loop until stable (max 8 iterations) so combined wrappers like
  // `"[Foo](https://x)."` are fully unwrapped regardless of order.
  for (let i = 0; i < 8; i++) {
    const before = u;

    const mdMatch = u.match(/^\[[^\]]*\]\((.+)\)$/);
    if (mdMatch) u = mdMatch[1].trim();

    const angleMatch = u.match(/^<(.+)>$/);
    if (angleMatch) u = angleMatch[1].trim();

    for (const [open, close] of pairs) {
      if (u.startsWith(open) && u.endsWith(close) && u.length > open.length + close.length) {
        u = u.slice(open.length, -close.length).trim();
      }
    }

    u = decodeHtmlEntities(u);
    u = u.replace(/[.,!?;:]+$/g, '');

    while (/[)\]}]$/.test(u)) {
      const close = u.slice(-1);
      const open = close === ')' ? '(' : close === ']' ? '[' : '{';
      const opens = (u.match(new RegExp(`\\${open}`, 'g')) || []).length;
      const closes = (u.match(new RegExp(`\\${close}`, 'g')) || []).length;
      if (closes > opens) u = u.slice(0, -1);
      else break;
    }

    if (u === before) break;
  }
  return u;
};

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require an authenticated user — prevents this endpoint from being used
    // as an unauthenticated outbound HTTP relay attributed to Chravel's egress.
    const auth = await requireAuth(req, corsHeaders);
    if (auth.error) return auth.response;

    // Validate request body with Zod schema (SSRF protection)
    const rawBody = await req.json();
    const validation = validateInput(FetchOGMetadataSchema, rawBody);

    if (!validation.success) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // URL sanitization handled by module-scoped sanitizeUrl helper above.

    const url = sanitizeUrl(validation.data.url);

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
