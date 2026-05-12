import { describe, expect, it } from 'vitest';
import { getSettingsRouteIntent } from '../settingsRouteParams';

describe('getSettingsRouteIntent', () => {
  it('opens settings to saved recommendations when query flag is present', () => {
    expect(getSettingsRouteIntent('?openSettings=saved-recs')).toEqual({
      shouldOpen: true,
      consumerSection: 'saved-recs',
    });
  });

  it('does not open settings for unknown values', () => {
    expect(getSettingsRouteIntent('?openSettings=unknown')).toEqual({ shouldOpen: false });
  });
});
