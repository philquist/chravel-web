import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(__dirname, '../../migrations/20260531153000_enforce_payment_split_quota.sql'),
  'utf8',
);

describe('payment split quota migration', () => {
  it('guards the SECURITY DEFINER RPC with authenticated identity and membership checks', () => {
    expect(migrationSql).toContain('v_auth_uid uuid := auth.uid()');
    expect(migrationSql).toContain('p_created_by <> v_auth_uid');
    expect(migrationSql).toContain('public.is_active_trip_member(v_auth_uid, p_trip_id)');
  });

  it('serializes quota checks and validates split participants', () => {
    expect(migrationSql).toContain('pg_advisory_xact_lock');
    expect(migrationSql).toContain('jsonb_array_length(p_split_participants) <> p_split_count');
    expect(migrationSql).toContain('All split participants must be trip members');
  });

  it('enforces quota at the table boundary and seeds the voice feature flag', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION public.enforce_payment_request_quota',
    );
    expect(migrationSql).toContain('BEFORE INSERT ON public.trip_payment_messages');
    expect(migrationSql).toContain("'realtime_voice'");
  });
});
