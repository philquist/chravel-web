import { describe, expect, it } from 'vitest';
import { classifyQuery } from '../concierge/queryClassifier.ts';

describe('queryClassifier attachment intent and lean fallback', () => {
  it('routes attachment smart import intent to smart_import', () => {
    const cls = classifyQuery('please check this', true, { attachmentIntent: 'smart_import' });
    expect(cls).toBe('smart_import');
  });

  it('routes attachment summarize intent to trip_lookup_light', () => {
    const cls = classifyQuery('please check this', true, { attachmentIntent: 'summarize' });
    expect(cls).toBe('trip_lookup_light');
  });

  it('uses trip_summary for trip-scoped prompts', () => {
    const cls = classifyQuery('trip?', false);
    expect(cls).toBe('trip_summary');
  });
});
