import { describe, expect, it } from 'vitest';
import { buildSpeechText, speakableDomainFromUrl } from '@/lib/buildSpeechText';

describe('speakableDomainFromUrl', () => {
  it('strips www and path noise from https URLs', () => {
    expect(speakableDomainFromUrl('https://www.booking.com/hotel/us/foo?ref=abc')).toBe(
      'booking.com',
    );
  });

  it('handles bare www hosts', () => {
    expect(speakableDomainFromUrl('www.tripadvisor.com/Restaurant_Review')).toBe('tripadvisor.com');
  });

  it('returns null for unparseable input', () => {
    expect(speakableDomainFromUrl('not a url')).toBeNull();
  });
});

describe('buildSpeechText URL + markdown narration', () => {
  it('keeps markdown link labels and never speaks the href', () => {
    const spoken = buildSpeechText({
      displayText: 'Book [Hotel Casa](https://www.hotelcasa.com/rooms) tonight.',
    });

    expect(spoken).toBe('Book Hotel Casa tonight.');
    expect(spoken).not.toMatch(/https?:\/\//i);
    expect(spoken).not.toContain('hotelcasa.com');
  });

  it('replaces bare https URLs with a spoken domain phrase', () => {
    const spoken = buildSpeechText({
      displayText: 'Details are here: https://www.booking.com/hotel/us/foo?utm=1 for the group.',
    });

    expect(spoken).toBe('Details are here: a link to booking.com for the group.');
    expect(spoken).not.toMatch(/https?:\/\//i);
    expect(spoken).not.toContain('utm=');
  });

  it('replaces bare www URLs without a scheme', () => {
    const spoken = buildSpeechText({
      displayText: 'See www.opentable.com/r/downtown for the reservation.',
    });

    expect(spoken).toBe('See a link to opentable.com for the reservation.');
  });

  it('does not spell out tracking query strings or markdown image URLs', () => {
    const spoken = buildSpeechText({
      displayText:
        'Preview ![map](https://maps.example.com/static?key=secret) and then visit https://bit.ly/abc123.',
    });

    expect(spoken).toContain('a link to bit.ly');
    expect(spoken).not.toContain('secret');
    expect(spoken).not.toContain('maps.example.com');
    expect(spoken).not.toMatch(/https?:\/\//i);
  });

  it('summarizes place cards without reading card URLs aloud', () => {
    const spoken = buildSpeechText({
      displayText: 'Here are a few spots.',
      places: [
        {
          placeId: 'p1',
          name: 'Cafe Lux',
          address: '12 Main St',
          rating: 4.6,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          mapsUrl: 'https://maps.google.com/?cid=999',
        },
      ],
    });

    expect(spoken).toContain('Here are a few spots.');
    expect(spoken).toContain('Cafe Lux');
    expect(spoken).toContain('12 Main St');
    expect(spoken).toContain('rated 4.6');
    expect(spoken).toContain('moderately priced');
    expect(spoken).toContain('Tap Save to Trip on any card to pin it.');
    expect(spoken).not.toMatch(/https?:\/\//i);
  });
});
