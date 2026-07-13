import { describe, expect, it } from 'vitest';
import {
  classifyHomeAway,
  summarizeHomeAwayClassifications,
} from '@/features/calendar/utils/homeAwayClassification';

describe('classifyHomeAway', () => {
  it('uses explicit labels with full confidence', () => {
    expect(classifyHomeAway({ title: 'Game', explicitLabel: 'home' })).toMatchObject({
      classification: 'home',
      confidence: 1,
    });
    expect(classifyHomeAway({ title: 'Game', explicitLabel: 'Away' })).toMatchObject({
      classification: 'away',
      confidence: 1,
    });
  });

  it('classifies vs as home and @ as away', () => {
    expect(classifyHomeAway({ title: 'Lakers vs Celtics' }).classification).toBe('home');
    expect(classifyHomeAway({ title: 'Lakers @ Celtics' }).classification).toBe('away');
  });

  it('marks ambiguous titles as unknown', () => {
    expect(classifyHomeAway({ title: "Trivia Night at Joe's" }).classification).toBe('unknown');
  });

  it('detects neutral-site keywords', () => {
    expect(
      classifyHomeAway({ title: 'Championship Final', description: 'Neutral site tournament' })
        .classification,
    ).toBe('neutral');
  });
});

describe('summarizeHomeAwayClassifications', () => {
  it('does not offer filters for sparse or low-confidence schedules', () => {
    const summary = summarizeHomeAwayClassifications([
      { title: 'Show at Garden' },
      { title: 'Show at Forum' },
    ]);
    expect(summary.canOfferFilter).toBe(false);
  });

  it('offers filters when enough sports games classify confidently', () => {
    const summary = summarizeHomeAwayClassifications([
      { title: 'Pacers vs Celtics' },
      { title: 'Pacers vs Heat' },
      { title: 'Pacers @ Knicks' },
      { title: 'Pacers @ Nets' },
      { title: 'Pacers vs Bucks' },
    ]);
    expect(summary.canOfferFilter).toBe(true);
    expect(summary.homeCount).toBeGreaterThan(0);
    expect(summary.awayCount).toBeGreaterThan(0);
  });

  it('never silently drops unknown rows from counts', () => {
    const summary = summarizeHomeAwayClassifications([
      { title: 'Pacers vs Celtics' },
      { title: 'Community BBQ' },
      { title: 'Pacers @ Heat' },
      { title: 'Fundraiser' },
      { title: 'Pacers vs Bucks' },
    ]);
    expect(summary.unknownCount).toBeGreaterThan(0);
    expect(summary.classifications).toHaveLength(5);
  });
});
