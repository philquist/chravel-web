/**
 * Scrape Schedule Edge Function
 *
 * Uses Firecrawl (headless browser) as primary scraper for full JS rendering,
 * falls back to raw fetch() for sites that don't need JS.
 * Sends content to Gemini for structured event extraction.
 *
 * Flow: URL → Firecrawl (renders JS, returns markdown) → Gemini → structured events
 * Fallback: URL → raw fetch() → Gemini → structured events
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { validateExternalUrlBeforeFetch } from '../_shared/validation.ts';
import {
  invokeChatModel,
  extractTextFromChatResponse,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../_shared/gemini.ts';
import {
  scrapeUrlContentForAi,
  getScrapeContentTypeLabel,
  type UrlScrapeMethod,
} from '../_shared/urlScraper.ts';
import { checkAndIncrementSmartImportUsage } from '../_shared/smartImportUsage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface ScheduleEvent {
  title: string;
  date: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  location?: string;
  home_away?: 'home' | 'away' | 'neutral' | 'unknown';
  opponent?: string;
}

/** Max characters of raw HTML to send to Gemini (1M token model) */
const MAX_CONTENT_LENGTH = 1_000_000;

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse input ──
    const body = await req.json();
    let { url, tripId } = body as { url?: string; tripId?: string | null };

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof tripId !== 'string' || !tripId.trim()) {
      tripId = null;
    }

    const usage = await checkAndIncrementSmartImportUsage(supabase, user.id, tripId);
    if (!usage.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Smart Import limit reached for this month. Upgrade to continue importing.',
          error_code: usage.errorCode,
          upgrade_required: usage.upgradeRequired,
          remaining: usage.remaining,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    url = url.trim();
    if (url.startsWith('http://')) url = url.replace('http://', 'https://');
    if (!url.startsWith('https://')) url = 'https://' + url;

    // SSRF protection
    if (!(await validateExternalUrlBeforeFetch(url))) {
      return new Response(
        JSON.stringify({ error: 'URL must be HTTPS and external (no internal/private networks)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[scrape-schedule] Processing URL: ${url}`);

    // ── Scrape: Firecrawl -> raw fetch -> reader proxy fallback ──
    let contentForAI = '';
    let scrapeMethod: UrlScrapeMethod;
    const scrapeResult = await scrapeUrlContentForAi(url, { logPrefix: 'scrape-schedule' });
    if (!scrapeResult) {
      return new Response(
        JSON.stringify({
          error:
            'Could not access this website. The page appears to block automated fetches. Try a direct schedule URL, paste the schedule text, or upload a screenshot/PDF.',
          scrape_method: 'blocked',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    contentForAI = scrapeResult.content;
    scrapeMethod = scrapeResult.method;

    // ── Cap content ──
    if (contentForAI.length > MAX_CONTENT_LENGTH) {
      console.log(
        `[scrape-schedule] Truncating from ${contentForAI.length} to ${MAX_CONTENT_LENGTH} chars`,
      );
      contentForAI = contentForAI.substring(0, MAX_CONTENT_LENGTH);
    }

    console.log(
      `[scrape-schedule] Sending ${contentForAI.length} chars to Gemini (via ${scrapeMethod})`,
    );

    // ── Send to Gemini for extraction (45s timeout) ──
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const contentType = getScrapeContentTypeLabel(scrapeMethod);

    const systemPrompt = `You are a schedule extraction expert. Extract ONLY games, events, shows, matches, or performances from this ${contentType}.

For each event extract:
- title: The matchup or event name exactly as shown (e.g., "Lakers at Memphis Grizzlies", "Concert at Madison Square Garden")
- date: YYYY-MM-DD format
- start_time: HH:MM in 24-hour format IF clearly listed on the page. Otherwise OMIT this field entirely.
- location: Venue name and city if shown. Do NOT guess addresses.
- home_away: ONLY for team sports schedules when clearly labeled. Use "home", "away", "neutral", or "unknown". If not a sports schedule or uncertain, use "unknown" or omit.
- opponent: Opponent/team name when clearly available for sports; otherwise omit.

CRITICAL RULES:
1. Today's date is ${todayStr}. Only include events dated ${todayStr} or later. Do NOT include ANY past events.
2. Do NOT fill in end_time - omit it completely.
3. Do NOT fill in description - omit it completely.
4. If no start time is clearly listed on the page, OMIT start_time entirely. Do NOT guess times.
5. Return ONLY a valid JSON array of objects. No markdown, no explanation, just the JSON array.
6. If no schedule/events are found, return an empty array: []
7. Look through ALL the content to find events — check every section, table, list, and data block.
8. For tour/comedy/concert sites, each show date counts as a separate event.
9. Never invent home/away when the source does not clearly indicate it. Prefer "unknown".

Example output:
[
  {"title": "Pacers vs Celtics", "date": "2026-02-10", "start_time": "19:00", "location": "Gainbridge Fieldhouse", "home_away": "home", "opponent": "Celtics"},
  {"title": "Trevor Noah Live", "date": "2026-02-15", "location": "Ryman Auditorium, Nashville TN", "home_away": "unknown"}
]`;

    let rawContent = '';
    try {
      const aiResult = await invokeChatModel({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Extract the schedule/events from this ${contentType}. Remember: only events from ${todayStr} onward.\n\n${contentForAI}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 16000,
        timeoutMs: 45_000,
      });
      rawContent = extractTextFromChatResponse(aiResult.raw, aiResult.provider);
      console.log(`[scrape-schedule] AI provider=${aiResult.provider} model=${aiResult.model}`);
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : String(aiError);
      console.error(`[scrape-schedule] AI extraction error: ${message}`);

      if (message.includes('429')) {
        return new Response(
          JSON.stringify({ error: 'AI service is busy. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (message.includes('402')) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ error: 'AI service error. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[scrape-schedule] AI response length: ${rawContent.length}`);

    // ── Parse AI response ──
    let allEvents: ScheduleEvent[] = [];
    try {
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        allEvents = parsed;
      } else if (parsed && Array.isArray(parsed.events)) {
        allEvents = parsed.events;
      } else if (parsed && Array.isArray(parsed.results)) {
        allEvents = parsed.results;
      } else {
        console.error('[scrape-schedule] AI did not return an array-like payload');
        allEvents = [];
      }
    } catch (parseErr) {
      console.error(
        '[scrape-schedule] Failed to parse AI JSON:',
        parseErr,
        'Raw:',
        rawContent.substring(0, 500),
      );
      return new Response(
        JSON.stringify({
          error:
            'Could not extract schedule data from this page. Try copying the schedule text and pasting it instead.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Filter to future events ──
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const futureEvents = allEvents.filter(e => {
      if (!e.date || !e.title) return false;
      try {
        const eventDate = new Date(e.date + 'T00:00:00');
        return eventDate >= todayDate;
      } catch {
        return false;
      }
    });

    const eventsFiltered = allEvents.length - futureEvents.length;

    console.log(
      `[scrape-schedule] Found ${allEvents.length} total events, ${futureEvents.length} future, ${eventsFiltered} filtered out (via ${scrapeMethod})`,
    );

    if (futureEvents.length === 0 && allEvents.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Found ${allEvents.length} event${allEvents.length !== 1 ? 's' : ''} but all are in the past. Only future events are imported.`,
          events: [],
          events_found: allEvents.length,
          events_filtered: eventsFiltered,
          source_url: url,
          scrape_method: scrapeMethod,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (futureEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'No schedule or events found on this page. Make sure the URL points to a schedule page with visible dates.',
          events: [],
          events_found: 0,
          events_filtered: 0,
          source_url: url,
          scrape_method: scrapeMethod,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        events: futureEvents,
        events_found: allEvents.length,
        events_filtered: eventsFiltered,
        source_url: url,
        scrape_method: scrapeMethod,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error('[scrape-schedule] Request timed out');
      return new Response(
        JSON.stringify({
          error:
            'The request took too long to process. Try a simpler URL or paste the schedule text instead.',
        }),
        { status: 408, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    console.error('[scrape-schedule] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
