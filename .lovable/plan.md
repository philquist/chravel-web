# Security Hardening Pass

Goal: close the outstanding scanner findings, tighten trip-scoped storage buckets, and do a codebase-wide sweep for exposed customer data (PII, media, financial info, auth artifacts).

## Phase 1 — Storage bucket hardening

Audit every bucket in `storage.buckets` and its `storage.objects` policies. For each user-generated bucket (`trip-photos`, `trip-media`, `trip-files`, `avatars`, `chat-uploads`, `payment-attachments`, receipts, etc.):

1. Confirm `public = false` unless the bucket is intentionally public (currently only `advertiser-assets` and `trip-covers` per security memory).
2. Replace broad `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies with membership-scoped policies keyed on the first path segment (trip_id) via `is_active_trip_member(auth.uid(), (storage.foldername(name))[1]::uuid)`.
3. Remove orphaned/legacy policies that no longer match an existing bucket.
4. Ensure UPDATE/DELETE are limited to the uploader (`owner = auth.uid()`) or a trip admin.
5. Client code that renders these assets must switch any lingering `getPublicUrl` calls to `createSignedUrl` (short TTL) for private buckets.

## Phase 2 — Close open scanner findings

- **`trip_media_index_any_member_update_delete`** (warn): restrict UPDATE/DELETE on `trip_media_index` and `trip_link_index` to the row's uploader (`added_by = auth.uid()`) OR a trip admin via `has_trip_admin_role`.
- **`update_policies_missing_with_check`** (warn): add mirrored `WITH CHECK` clauses to owner-scoped UPDATE policies on `trip_tasks`, `trip_files`, `trip_links`, `trip_polls`, `trip_payment_messages`, `broadcasts`, `receipts`, `trip_receipts`. Each `WITH CHECK` locks the immutable ownership + `trip_id` columns (same pattern already used on `payment_splits`).

## Phase 3 — PII/sensitive-column sweep

Query pg_catalog for tables containing potentially sensitive columns (`email`, `phone`, `address`, `dob`, `stripe_customer_id`, `apple_sub`, `push_token`, `payment_method`, `access_token`, `refresh_token`, `api_key`, `password`, `hash`). For each hit verify:

- RLS is enabled + at least one policy scoped to `auth.uid()` (never `true`).
- `anon` role has no `SELECT` grant unless the row is intentionally public.
- The column isn't leaked through a view or a `SECURITY DEFINER` function without a caller check.
- Client code doesn't select the column into unprivileged UIs (grep `select('*')` on these tables and narrow the projections).

Targets already known to warrant a second look: `profiles`, `gmail_accounts`, `apple_auth_tokens`, `push_device_tokens`, `web_push_subscriptions`, `user_payment_methods`, `user_loyalty_programs`, `secure_storage`, `organization_billing`, `payment_attachments`, `receipts`.

## Phase 4 — Edge function boundary check

Grep `supabase/functions/**` for:

- Missing `requireAuth` / `getClaims` before privileged writes.
- Service-role clients used without a prior membership check (must go through `verifyTripMembership`).
- `Access-Control-Allow-Origin: *` on functions that touch user data (should use the shared allowlist).
- Any `console.log` of tokens, emails, or bodies.

Fix violations in-place; add regression guards under `scripts/qa/` where the pattern is repeatable.

## Phase 5 — Client-side leakage sweep

- `rg` for `localStorage.setItem` / `sessionStorage` writes of tokens, emails, or user IDs beyond the Supabase auth key.
- Confirm no `service_role` key or admin allowlist ships in the bundle (guard already exists in `scripts/qa/check-no-hardcoded-admin-emails.cjs` — extend it to cover phone numbers and Stripe live keys).
- Verify `profiles_public` view is used everywhere a non-owner reads profile data.

## Verification

- Re-run `security--run_security_scan` and `supabase--linter`; expect zero WARN/ERROR from the fixed IDs.
- Run `npm run typecheck && npm run lint && npm run build`.
- Add / update tests: `scripts/qa/check-systemic-hardening-guards.cjs` gets new assertions for the storage membership helper and the WITH CHECK pattern.
- Manually confirm trip media still uploads/loads for a member; a non-member gets 403 on the signed URL request.
- Call `security--manage_security_finding` (`mark_as_fixed`) for the two open findings once the migration lands, and update `security--update_memory` with what became intentionally public vs private.

## Deliverables

- One migration: `supabase/migrations/<ts>_security_hardening_storage_and_rls.sql`.
- Client patches for any `getPublicUrl` → `createSignedUrl` swaps and narrowed `select()` projections.
- Optional: new/extended CI guard scripts under `scripts/qa/`.
- Security memory updated; findings marked fixed.

## Out of scope (call out, don't silently defer)

- Linter INFO items on unrelated tables (no policies but no data) — flagged for a follow-up prompt in the response footer if any remain after Phase 1.
- Function `search_path` WARNs — will be addressed opportunistically only for functions this migration already touches; the rest ship as a follow-up.
