import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for the `text = uuid` fanout bug.
//
// public.trips.id and public.trip_members.trip_id are TEXT, but
// create_notification_for_trip_members historically declared p_trip_id UUID and
// compared `t.id = p_trip_id` / `tm.trip_id = p_trip_id`. This DB has no
// `text = uuid` operator, so every fanout raised 42883 and rolled back the
// producing row. This migration retypes p_trip_id to TEXT and drops the old
// uuid overload so only the text signature remains.
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../migrations/20260709130000_fix_trip_notification_fanout_text_trip_id.sql',
  ),
  'utf8',
);

describe('trip notification fanout text trip_id migration', () => {
  it('drops the old uuid-signature overload with its exact arg list', () => {
    expect(migrationSql).toContain(
      'DROP FUNCTION IF EXISTS public.create_notification_for_trip_members(',
    );
    // The exact identity args of the broken overload (leading uuid trip id).
    expect(migrationSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_notification_for_trip_members\(\s*uuid,\s*uuid,\s*text,\s*text,\s*uuid,/,
    );
  });

  it('recreates the helper with a TEXT p_trip_id (matching trips.id / trip_members.trip_id)', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION public.create_notification_for_trip_members(',
    );
    // The recreated signature declares the trip id as TEXT as its first param.
    expect(migrationSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_notification_for_trip_members\(\s*p_trip_id\s+TEXT,/,
    );
  });

  it('compares trip ids text-to-text (no text = uuid)', () => {
    // The trips lookup and member loop compare against the now-TEXT p_trip_id.
    expect(migrationSql).toContain('WHERE t.id = p_trip_id');
    expect(migrationSql).toContain('WHERE tm.trip_id = p_trip_id');
    // notifications.trip_id is UUID, so the row insert casts explicitly.
    expect(migrationSql).toContain('p_trip_id::uuid');
  });

  it('routes the broadcast wrapper through the helper with a TEXT trip_id', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.notify_on_broadcast()');
    // Passes NEW.trip_id (TEXT) directly, not a uuid-cast local variable.
    expect(migrationSql).toMatch(/create_notification_for_trip_members\(\s*NEW\.trip_id,/);
    // Retains the non-UUID skip guard so bad trip ids never abort the broadcast.
    expect(migrationSql).toContain('WHEN invalid_text_representation THEN');
  });
});
