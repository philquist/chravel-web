import { describe, expect, it } from 'vitest';
import { assemblePrompt } from '../concierge/promptAssembler.ts';

const tripContext = {
  tripMetadata: {
    id: 'trip-1',
    name: 'Team Tour',
    destination: 'Los Angeles',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
    type: 'pro',
  },
  collaborators: [],
  teamsAndChannels: { memberRoles: [], channels: [] },
  messages: [],
  calendar: [],
  tasks: [],
  payments: [],
  polls: [],
  broadcasts: [],
  places: { savedPlaces: [] },
  media: { files: [], links: [] },
};

describe('promptAssembler action plan mode', () => {
  it('defaults to tool-first mode without JSON action plan mandate', () => {
    const prompt = assemblePrompt({
      queryClass: 'task_action',
      tripContext: tripContext as any,
    });

    expect(prompt).not.toContain('ACTION PLAN FORMAT');
    expect(prompt).toContain('MULTI-TOOL EXECUTION');
  });
});

describe('promptAssembler premium preference grounding', () => {
  const withPrefs = (userPreferences: Record<string, unknown>) => ({
    ...tripContext,
    userPreferences,
  });

  it('omits all preference grounding when userPreferences is absent (free-tier path)', () => {
    // contextBuilder returns undefined userPreferences for free/unauth users, so the
    // assembled prompt must contain no preference or budget grounding at all.
    const prompt = assemblePrompt({
      queryClass: 'hotel_search',
      tripContext: tripContext as any,
    });

    expect(prompt).not.toContain('USER PREFERENCES');
    expect(prompt).not.toContain('HARD BUDGET CONSTRAINT');
  });

  it('injects a hard budget constraint (not a soft filter) for a budget preference', () => {
    const prompt = assemblePrompt({
      queryClass: 'hotel_search',
      tripContext: withPrefs({ budget: 'up to $500 per day' }) as any,
    });

    expect(prompt).toContain('HARD BUDGET CONSTRAINT');
    expect(prompt).toContain('up to $500 per day');
    expect(prompt).toContain('strict maximum');
    // Regression: budget must no longer be a mere soft "(do not exceed)" line.
    expect(prompt).not.toContain('BUDGET: up to $500 per day (do not exceed)');
  });

  it('renders soft dietary/vibe filters when set', () => {
    const prompt = assemblePrompt({
      queryClass: 'restaurant_recommendation',
      tripContext: withPrefs({ dietary: ['vegetarian'], vibe: ['family-friendly'] }) as any,
    });

    expect(prompt).toContain('USER PREFERENCES (APPLY AS FILTERS)');
    expect(prompt).toContain('DIETARY: vegetarian');
    expect(prompt).toContain('VIBE: family-friendly');
  });

  it('does not inject preferences for non-preference query classes even when present', () => {
    const prompt = assemblePrompt({
      queryClass: 'payment_query',
      tripContext: withPrefs({ budget: 'up to $500 per day', dietary: ['vegetarian'] }) as any,
    });

    expect(prompt).not.toContain('HARD BUDGET CONSTRAINT');
    expect(prompt).not.toContain('DIETARY: vegetarian');
  });
});
