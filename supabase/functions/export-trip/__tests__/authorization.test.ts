import { describe, expect, it } from 'vitest';

import {
  canExportTripPdf,
  PRO_TRIP_DEFAULT_EXPORT_SECTIONS,
  resolveDefaultTripExportSections,
} from '../authorization';

describe('export-trip authorization policy', () => {
  it('requires a matching trip membership before PDF export', () => {
    expect(canExportTripPdf({ userId: undefined, membership: { user_id: 'member-1' } })).toBe(
      false,
    );
    expect(canExportTripPdf({ userId: 'outsider', membership: null })).toBe(false);
    expect(canExportTripPdf({ userId: 'outsider', membership: { user_id: 'member-1' } })).toBe(
      false,
    );
    expect(canExportTripPdf({ userId: 'member-1', membership: { user_id: 'member-1' } })).toBe(
      true,
    );
  });

  it('keeps the existing pro export contract explicit for sensitive sections', () => {
    expect(PRO_TRIP_DEFAULT_EXPORT_SECTIONS).toEqual(
      expect.arrayContaining(['roster', 'broadcasts', 'attachments']),
    );
    expect(resolveDefaultTripExportSections('pro')).toEqual(PRO_TRIP_DEFAULT_EXPORT_SECTIONS);
    expect(resolveDefaultTripExportSections('onepager')).not.toEqual(
      expect.arrayContaining(['roster', 'broadcasts', 'attachments']),
    );
  });
});
