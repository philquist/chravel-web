# Live RLS Audit — Chravel Production

**Project:** `jmjiyekmxwsxkfnqwyaa` (Supabase Chravel, status: ACTIVE_HEALTHY)
**Date:** 2026-05-12
**Source:** Live `pg_class` / `pg_policies` introspection via Supabase MCP (not migration grep)
**Scope:** `public` schema only

## Top-Line

| Metric | Value |
|---|---|
| Public tables | 91 |
| Tables with RLS enabled | 91 (100%) |
| Tables with RLS disabled | **0** |
| Total policies | 263 |

No table in `public` is missing RLS. This was the previous audit's biggest unknown — confirmed clean.

## Findings

### F-1 — Tables with RLS enabled but **no policies** (MEDIUM)

These tables have RLS on, but no policies defined. Effect: all reads/writes blocked except `service_role` (which bypasses RLS). Almost certainly intentional (server-only tables) but flagging because a single accidental policy or RLS toggle could open them.

| Table | Likely Intent | Confirm |
|---|---|---|
| `notification_deliveries` | Server-only delivery log | Verify edge functions use `service_role` client; no JS client reads expected. |
| `webhook_events` | Stripe/external webhook log | Same — server-only. |

**Recommendation:** Add explicit `service_role`-scoped policies (`USING (true) WITH CHECK (true)` for the service role) so the intent is documented in-schema. Otherwise the next dev who adds a "small read policy" can silently expose the whole table.

### F-2 — Wide-open `USING (true)` / `WITH CHECK (true)` policies (review individually)

21 policies match this pattern. Categorizing:

#### F-2a — Intentional, low risk

| Table | Policy | Verdict |
|---|---|---|
| `feature_flags` | `Anon/Authenticated can read` | OK — kill-switch table is meant to be world-readable. |
| `app_settings` | `Anon/Authenticated read` | OK if all rows are public app config. **Verify no per-user or secret rows exist in this table.** |
| `rate_limits` | `Service role manages` (x2 duplicates) | OK — service-role-only. Note duplicate policies (`manage` + `manages`) — consider deduplicating. |
| `security_audit_log` | `system_insert_audit_logs` (service_role INSERT) | OK. |
| `recommendation_*` service-role policies | OK — internal-only writes. |
| `recommendation_items_select_authenticated` | `WHERE is_active=true` | OK — gated by `is_active`, not fully open. |
| `event_qa_upvotes` `view_upvotes` | Public SELECT `true` | Likely OK (upvote counts are non-sensitive), but verify no user-identifying columns are exposed. |
| `user_trip_roles` `Admins with role permission can assign roles` | `WITH CHECK` has real predicate, just contains the literal `true` in `NOT is_primary` branch | False positive — predicate is correct. |
| `trip_invites` `Trip members can view invites` | `qual` contains `EXISTS (...)` | False positive — predicate is gated. |

#### F-2b — Worth review

| Table | Policy | Concern |
|---|---|---|
| **`invite_links`** | `Anyone can view active invite links` — `roles: public`, `qual: (is_active = true)` | Any unauthenticated client can `SELECT * FROM invite_links WHERE is_active=true`. If invite codes are guessable / brute-forceable, this is enumeration. **Confirm code entropy ≥ 128 bits and that no sensitive fields (creator email, trip name) are columns on this table.** If they are, scope the SELECT to `auth.uid() IS NOT NULL` or filter columns via a view. |
| **`campaign_analytics`** `analytics_insert_authenticated` | INSERT `WITH CHECK (true)` for `authenticated` | Any logged-in user can insert any analytics row (impersonate any campaign, spam click counts). Add a `WITH CHECK (user_id = auth.uid())` or route through an edge function. |
| **`recommendation_clicks_insert_authenticated`** | INSERT `WITH CHECK (true)` for `authenticated` | Same — analytics tampering vector. Same fix. |
| `trip_invites` `Authenticated users can view active invites by code` | `qual: (is_active = true)` for `authenticated` | Authenticated users can list ALL active invites across the platform, not just ones for trips they're in. The companion `Trip members can view invites` policy is properly scoped, but RLS ORs policies together — so this one strictly widens access. **Either remove this policy or add a `code = current_setting('app.invite_code', true)` gate.** This is the highest-priority finding. |

### F-3 — Duplicate policies (LOW)

- `rate_limits` has two functionally identical `service_role ALL` policies (`Service role can manage rate limits` and `Service role manages rate limits`). Remove one.
- `feature_flags` has separate `anon` and `authenticated` SELECT policies that could be merged into one for `public`.

Drift risk, not a security issue.

## Recommended Actions

| Priority | Item | Fix |
|---|---|---|
| **P0** | `trip_invites` global-list policy | Drop `Authenticated users can view active invites by code` or rescope. |
| **P0** | `invite_links` public SELECT | Audit columns + verify code entropy; restrict to authenticated if any PII present. |
| P1 | `campaign_analytics` / `recommendation_clicks` INSERT spoofing | Add `WITH CHECK (user_id = auth.uid())`. |
| P1 | `notification_deliveries` / `webhook_events` zero-policy | Add explicit service-role policy to document intent. |
| P2 | `app_settings` anon read | Confirm no secrets in table. |
| P3 | Duplicate `rate_limits` policies | Drop the dupe. |

## Reproducing this audit

The four queries used live in this report's git history (see commit). To rerun:

```sql
-- Tables without RLS
SELECT n.nspname, c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind='r' AND n.nspname='public' AND c.relrowsecurity=false;

-- Tables with RLS but no policies
SELECT n.nspname, c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relkind='r' AND n.nspname='public' AND c.relrowsecurity=true
GROUP BY n.nspname, c.relname HAVING count(p.polname)=0;

-- Wide-open policies
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public'
  AND ((qual ILIKE '%true%' AND qual !~ '\m(auth\.|exists|select|join)\M')
    OR (with_check ILIKE '%true%' AND with_check !~ '\m(auth\.|exists|select|join)\M'));
```

Run via Supabase MCP (`execute_sql`) or `psql` against the project DB.
