import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('P0 security hardening regression checks', () => {
  it('keeps subscription and restore-trip admin bypasses on the shared server-side helper', () => {
    const checkSubscription = read('supabase/functions/check-subscription/index.ts');
    const restoreTrip = read('supabase/functions/restore-trip/index.ts');

    expect(checkSubscription).not.toMatch(/const\s+SUPER_ADMIN_EMAILS\s*=\s*new\s+Set/);
    expect(restoreTrip).not.toMatch(/FOUNDER_EMAILS/);
    expect(checkSubscription).toContain('../_shared/superAdmins.ts');
    expect(restoreTrip).toContain('../_shared/superAdmins.ts');
  });

  it('does not log authenticated user email in subscription admin bypass traces', () => {
    const checkSubscription = read('supabase/functions/check-subscription/index.ts');

    expect(checkSubscription).not.toContain(
      "logStep('User authenticated', { userId: user.id, email: user.email })",
    );
    expect(checkSubscription).not.toContain(
      "logStep('Super admin detected - bypassing Stripe check', { email: user.email })",
    );
    expect(checkSubscription).toContain('{ userId: user.id }');
  });

  it('requires active trip membership and returns not-found for unauthorized trip detail access', () => {
    const getTripDetail = read('supabase/functions/get-trip-detail/index.ts');

    expect(getTripDetail).toContain(".eq('status', 'active')");
    expect(getTripDetail).not.toContain('.upsert(\n            { trip_id: tripId');
    expect(getTripDetail).toContain("error_code: 'TRIP_NOT_FOUND'");
    expect(getTripDetail).not.toContain("error: 'Access denied'");
  });

  it('makes database super-admin checks depend on auth.uid instead of email fallback', () => {
    const migration = read(
      'supabase/migrations/20260626143000_harden_super_admin_identity_and_trip_detail.sql',
    );

    expect(migration).toContain('WHERE user_id = auth.uid()');
    expect(migration).not.toMatch(/jwt\(\)\s*->>\s*'email'/i);
    expect(migration).toContain('Cannot grant super admin access to an email without an auth user');
  });

  it('hardens realtime, push token, embedding, and capacity database access in the migration', () => {
    const migration = read(
      'supabase/migrations/20260626143000_harden_super_admin_identity_and_trip_detail.sql',
    );

    expect(migration).toContain('DROP POLICY IF EXISTS "Notifications realtime: owner only"');
    expect(migration).toContain("realtime.topic() = 'notifications:' || auth.uid()::text");
    expect(migration).not.toMatch(/realtime\.topic\(\)\s+not\s+like/i);
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_trip_member_push_tokens(uuid, uuid[]) FROM anon, authenticated',
    );
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_trip_member_limit(text) FROM anon, authenticated',
    );
  });

  it('guards public service-role edge functions against unauthenticated or cross-tenant access', () => {
    const messageParser = read('supabase/functions/message-parser/index.ts');
    const broadcastsReact = read('supabase/functions/broadcasts-react/index.ts');
    const messageScheduler = read('supabase/functions/message-scheduler/index.ts');
    const populateSearchIndex = read('supabase/functions/populate-search-index/index.ts');
    const imageUpload = read('supabase/functions/image-upload/index.ts');

    expect(messageParser).toContain("req.headers.get('authorization')");
    expect(messageParser).toContain(".eq('status', 'active')");
    expect(messageParser).not.toContain('await fetch(url');
    expect(broadcastsReact).toContain(".from('broadcasts')");
    expect(broadcastsReact).toContain(".eq('status', 'active')");
    expect(messageScheduler).toContain('verifyCronAuth(req, corsHeaders)');
    expect(messageScheduler).toContain(".eq('trip_id', trip_id)");
    expect(populateSearchIndex).toContain('verifyCronAuth(req, corsHeaders)');
    expect(imageUpload).toContain("const folder = 'ad-images'");
    expect(imageUpload).toContain(".from('advertiser_profiles')");
    expect(imageUpload).toContain('Advertiser access required');
  });
});
