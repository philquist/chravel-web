## Restore leave_trip function and trip_members status/left_at columns

Two February migrations never landed in production, so `supabase.rpc('leave_trip', ...)` in `useTripMembersQuery.ts` has been failing. This plan applies the exact SQL provided by the user as a new timestamped migration.

### Steps

1. **Create migration** `supabase/migrations/20260705020000_restore_leave_trip_membership_status.sql` via the `supabase--migration` tool with the SQL below.
2. Once approved and applied, Supabase auto-regenerates `src/integrations/supabase/types.ts` to include `trip_members.status` and `trip_members.left_at`.
3. No client code changes — `useTripMembersQuery.ts` already calls `leave_trip` correctly.

### Migration SQL (exact, as provided)

- Adds `status TEXT NOT NULL DEFAULT 'active'` and `left_at TIMESTAMPTZ` to `public.trip_members` (idempotent via `IF NOT EXISTS`).
- Creates `public.is_active_trip_member(uuid, text)` SECURITY DEFINER helper.
- Replaces the `"Users can view their trips"` SELECT policy on `public.trips` with one that uses `is_active_trip_member` (behavior-preserving for existing members since backfill defaults to `'active'`).
- Creates `public.leave_trip(text)` SECURITY DEFINER function that: marks the caller `status='left'`, archives the trip if no active members remain, and promotes the oldest remaining member to admin if the creator leaves.
- `GRANT EXECUTE ON FUNCTION public.leave_trip(text) TO authenticated`.

### Safety

- Additive only. Only replacement is the `trips` SELECT policy, whose new form is equivalent for all current members (default `'active'`).
- Does not touch the `trips` UPDATE policy or `trip_admins` policy fixed later in `20260603120000` (no RLS-recursion regression).
- No file deletions or renames.

### Verification after apply

- `types.ts` should include `status` and `left_at` on `trip_members`.
- CI `check-schema-drift.ts` (referencing `src/pages/TripPreview.tsx:50`) should pass.
- Smoke: an authenticated user calling `leave_trip` no longer errors; row is soft-deleted (`status='left'`, `left_at=now()`), and trip is archived if they were the last active member.
