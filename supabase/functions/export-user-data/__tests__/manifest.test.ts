import { describe, expect, it } from 'vitest';

import {
  createManifestEntry,
  hasRequiredExportFailures,
  REQUIRED_USER_DATA_TABLES,
} from '../manifest';

describe('export-user-data manifest policy', () => {
  it('marks required user data tables as hard failures', () => {
    expect(Array.from(REQUIRED_USER_DATA_TABLES)).toEqual(
      expect.arrayContaining([
        'profiles',
        'user_preferences',
        'notification_preferences',
        'trip_members',
        'trip_files',
      ]),
    );

    const manifest = [
      createManifestEntry({
        table: 'profiles',
        description: 'User profile information',
        error: 'permission denied',
      }),
      createManifestEntry({
        table: 'ai_queries',
        description: 'AI concierge queries',
        error: 'table unavailable',
      }),
    ];

    expect(manifest[0]).toMatchObject({
      table: 'profiles',
      required: true,
      status: 'failed_required',
      rowCount: 0,
      error: 'permission denied',
    });
    expect(manifest[1]).toMatchObject({
      table: 'ai_queries',
      required: false,
      status: 'skipped_optional',
    });
    expect(hasRequiredExportFailures(manifest)).toBe(true);
  });

  it('records included versus empty tables with row counts', () => {
    expect(
      createManifestEntry({
        table: 'trip_members',
        description: 'Trip memberships',
        rowCount: 2,
      }),
    ).toMatchObject({ status: 'included', rowCount: 2, required: true });

    expect(
      createManifestEntry({
        table: 'saved_recommendations',
        description: 'Saved recommendations',
        rowCount: 0,
      }),
    ).toMatchObject({ status: 'empty', rowCount: 0, required: false });
  });
});
