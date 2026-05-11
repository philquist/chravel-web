import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseURLSchedule } from '@/utils/calendarImportParsers';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('calendarImportParsers parseURLSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces scraper method in user-facing errors', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: false,
        error: 'Could not access this website',
        scrape_method: 'blocked',
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const result = await parseURLSchedule('https://example.com/blocked');

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('(blocked)');
  });

  it('preserves zero-count url meta on unsuccessful parses', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: false,
        error: 'No schedule found',
        events_found: 0,
        events_filtered: 0,
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const result = await parseURLSchedule('https://example.com/no-events');

    expect(result.isValid).toBe(false);
    expect(result.urlMeta).toEqual({ eventsFound: 0, eventsFiltered: 0 });
  });

  it('maps enriched scrape metadata into calendar event fields', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        scrape_method: 'firecrawl',
        source_url: 'https://example.com/tour',
        events: [
          {
            title: 'Band Tour Night 1',
            date: '2026-06-12',
            start_time: '20:00',
            end_time: '22:30',
            location: 'MSG',
            timezone: 'America/New_York',
            source_text: 'Fri Jun 12 8:00 PM',
            category: 'concert',
          },
        ],
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const result = await parseURLSchedule('https://example.com/tour');

    expect(result.isValid).toBe(true);
    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event.endTime.getHours()).toBe(22);
    expect(event.endTime.getMinutes()).toBe(30);
    expect(event.description).toContain('Category: concert');
    expect(event.description).toContain('Timezone: America/New_York');
    expect(event.description).toContain('Scrape method: firecrawl');
    expect(event.description).toContain('Source URL: https://example.com/tour');
  });

  it('maps events and falls back url meta counts safely', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        events: [{ title: 'Flight to JFK', date: '2026-06-01', start_time: '09:30' }],
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const result = await parseURLSchedule('https://example.com/itinerary');

    expect(result.isValid).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.urlMeta).toEqual({ eventsFound: 1, eventsFiltered: 0 });
  });
});
