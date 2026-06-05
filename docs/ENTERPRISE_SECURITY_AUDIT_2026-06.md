# Chravel Enterprise Security Audit — 2026-06

**Scope:** tenant isolation, RLS, edge-function authorization, realtime/storage
access, and audit logging, evaluated against the **live** production database
(`Chravel`, Supabase `jmjiyekmxwsxkfnqwyaa`) — not just repo intent.
**Method:** parallel codebase exploration + direct live-DB inspection via the
Supabase MCP (read-only SELECTs and `information_schema`/`pg_policies` queries).

---

## 1. Executive summary

Chravel already has a **strong security design in code**: an `organizations` →
teams → members → trips tenant model, `SECURITY DEFINER` RLS helper functions with
`search_path` pinning, a generated permission matrix with enforced frontend/backend
parity, edge functions that re-verify membership before mutating, HMAC-verified
Stripe/Stream webhooks, and channel-membership-based chat isolation.

**The dominant risk was not missing design — it was undeployed design (migration
drift) plus one broken audit-logging helper.** Several security-critical migrations
existed in the repo but had never been applied to the live database, so the
immutable admin audit log and the server-side super-admin function did not exist in
production. This pass deployed them, made the audit log genuinely append-only,
fixed the silently-failing audit writer, and added small edge hardening.

---

## 2. Findings, ranked by severity

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **High** | **Migration drift:** `admin_audit_logs` (immutable admin audit log) and `is_super_admin()` (server-side privilege source of truth) defined in repo migration `20260320000000` but **never applied** to the live DB. No immutable admin audit log existed in production. | **Fixed** — deployed via MCP |
| F2 | **High** | **Silently-failing audit writer:** `_shared/security.ts logSecurityEvent()` inserted columns `{event_type, details, ip_address}` that do not exist on live `security_audit_log` (real columns: `action/table_name/metadata`). Fire-and-forget swallowed the error, so every security-event write was a no-op. | **Fixed** — remapped to real columns |
| F3 | **Medium** | **Audit log not truly immutable:** the `admin_audit_logs` migration relied only on the *absence* of UPDATE/DELETE RLS policies, which `service_role` (used by all edge writers) bypasses. No trigger prevented mutation. | **Fixed** — append-only trigger added + verified |
| F4 | **Medium** | **Org-governance drift:** `organization_seats/teams/role_policies/subscription_links` + transactional seat lifecycle + org admin audit logging (`log_org_admin_action`) defined in repo migration `20260524090000` but **never applied**. Org admin actions had nowhere to be audited. | **Fixed** — deployed via MCP |
| F5 | **Low** | **Membership-check duplication:** `livekit-token`, `stream-ensure-membership`, `stream-reconcile-membership` each re-implemented the `trip_members` lookup (one via anon/RLS, two via service-role) — drift risk. | **Fixed** — shared `verifyTripMembership` helper |
| F6 | **Low** | **No audit trail for capability-token issuance:** Stream/LiveKit token issuance was not recorded. | **Fixed** — `stream.token_issued` / `livekit.token_issued` events |
| F7 | **Low** | **LiveKit tokens long-lived:** no explicit TTL; relied on the SDK 6h default. | **Fixed** — explicit 15m TTL |
| F8 | Info | `stream-token` issues a trip-agnostic identity token with no membership check. **Not a vulnerability** — Stream isolation is channel-membership-based; the token grants no channel access alone. | Documented (posture pinned in header) |

### Explicitly **not** vulnerabilities (verified)

- **Frontend secret exposure:** none. Frontend uses only the public anon/
  publishable key; `.env.example` separates server-only secrets; `vite.config.ts`
  injects no secrets. Service-role key is server-only.
- **Webhook forgery:** Stripe (`constructEvent`) and Stream (HMAC-SHA256 +
  timing-safe compare) signatures are mandatory and fail-closed.
- **Client-trusted identifiers:** audited service-role functions
  (`stripe-webhook`, `check-subscription`, `restore-trip`,
  `process-account-deletions`, `stream-webhook`) all derive identity from JWT/
  signed source, never from request body.
- **CORS:** explicit allowlist, no wildcard subdomain matching.

---

## 3. Tenant-isolation matrix (representative tenant-owned tables)

| table | tenant_scope | membership_scope | RLS | gap |
|---|---|---|---|---|
| `organizations` | `id` | `organization_members` | ✅ | — |
| `organization_members` | `organization_id` | self/org-admin | ✅ | — |
| `organization_seats` | `organization_id` | `is_org_admin` | ✅ (deployed this pass) | — |
| `organization_teams` | `organization_id` | `is_org_member/admin` | ✅ (deployed this pass) | — |
| `trips` | `id` / `organization_id` | `trip_members` | ✅ | trip→org FK not enforced at schema level (app-level link) |
| `trip_members` | `trip_id` | self/trip-admin | ✅ | — |
| `trip_channels` | `trip_id` | `can_access_channel` | ✅ | — |
| `trip_media_index` | `trip_id` | uploader/member | ✅ | — |
| `admin_audit_logs` | (global, admin) | `is_super_admin` read; `service_role` insert; append-only | ✅ (deployed + trigger this pass) | hash-chaining / separate schema = future |
| `security_audit_log` | `user_id` | `is_super_admin` read; system insert | ✅ | append-only trigger = future enhancement |

---

## 4. Fixes implemented this pass

**Database (applied to live `jmjiyekmxwsxkfnqwyaa` via Supabase MCP):**
1. Deployed `is_super_admin()` + `admin_audit_logs` (table, RLS, indexes) — repo
   migration `20260320000000` content.
2. New migration `20260602120000_admin_audit_logs_append_only.sql` —
   `prevent_admin_audit_mutation()` trigger blocking UPDATE/DELETE for all roles.
   **Verified** by a self-rolling-back `DO` block: `update_blocked=t delete_blocked=t`.
3. Deployed `org_governance_hardening` (org seats/teams/role-policies/subscription
   links + seat-lifecycle RPCs + `log_org_admin_action`) — repo migration
   `20260524090000` content. All dependencies (`org_member_role`,
   `organization_billing`, `is_org_member/admin`, `admin_audit_logs`) verified
   present first.

**Edge functions (code):**
4. `_shared/verifyTripMembership.ts` (new) — canonical `is_trip_member` RPC wrapper;
   adopted in `livekit-token` and `stream-ensure-membership`.
5. `_shared/logSecurityEvent.ts` (new) — correct-schema audit writer; emits
   `stream.token_issued` / `livekit.token_issued`.
6. `_shared/security.ts` `logSecurityEvent` — remapped to the real columns (F2).
7. `livekit-token` — explicit `ttl: '15m'`; membership via shared helper.
8. `stream-token` — token-issuance audit log; header documents the channel-
   membership posture so the empty-body contract isn't "fixed" into a regression.

**Tests:** `_shared/verifyTripMembership.test.ts`, `_shared/logSecurityEvent.test.ts`
(Deno, pure fakes, matching `permissionGuard.test.ts`).

---

## 5. External-service posture (verified; no dashboard changes required this pass)

- **GetStream** — token generation backend-only; membership verified before
  channel add; removal synced via `stream-reconcile-membership`; channel-type
  permissions in `stream-setup-permissions`. Recommend a periodic reconcile audit.
- **LiveKit** — backend-only token issuance; tenant-scoped room names; membership
  gated; now 15m TTL.
- **Stripe** — webhook signatures verified; customer/subscription mapped from
  Stripe objects, not client input; entitlement changes audit-logged.
- **Google / Gmail** — OAuth tokens encrypted (`gmailTokenCrypto`); import bound to
  the authenticated user; durable checkpoints prevent cross-trip writes.
- **Twilio** — no standalone SMS edge function in current codebase (notification
  dispatch policy governs sends).

---

## 6. Remaining risks / tracked follow-ups

**Resolved in the follow-up cycle (2026-06-02):**
- **R1 — DONE:** `security_audit_log` is now append-only (UPDATE/DELETE/TRUNCATE
  triggers), mirroring `admin_audit_logs`.
- **R2 — DONE:** `src/integrations/supabase/types.ts` now includes
  `admin_audit_logs`, `super_admins`, and `organization_seats/teams/role_policies/
  subscription_links` (surgically injected; the file tracks the forward repo schema,
  which is ahead of the live DB, so it was not full-regenerated from live).
- **R4 — DONE:** super-admin access moved to a DB-backed `super_admins` table with
  grant/revoke functions and an audit trigger; `is_super_admin()` now reads the table.
- **R5 — PARTIAL:** hash-chaining (`prev_hash`/`event_hash` + `verify_admin_audit_chain()`)
  is implemented on `admin_audit_logs`. The external WORM sink remains future work;
  its design is documented in `docs/ENTERPRISE_SECURITY_READINESS.md`.
  - *Note:* the first hash-chain implementation ordered by `(created_at, id)`, which
    is non-deterministic for same-transaction rows; corrected to a monotonic `seq`
    column (migration `20260602160000`) and verified intact in production.

**Still open:**
- **R3 (Low):** trip→organization relationship is app-level, not a DB FK. Consider
  enforcing once all legacy trips are backfilled (two-phase migration).
- **R6 (SOC 2):** external write-once (WORM) audit-log sink — designed, not built.

---

## 7. Rollback notes

- The DB changes are **additive** (new table, new function, new triggers, new org
  tables/policies). Rollback = `DROP` the added objects; no existing data is
  modified or migrated, so rollback is safe and non-destructive. The append-only
  trigger can be dropped if it ever blocks a legitimate maintenance path (it
  intentionally blocks `service_role` too).
- Edge-function changes are behavior-preserving on the critical path (chat token
  contract unchanged; voice membership check is an equivalent RPC). Rollback =
  revert the commit; no schema dependency from the code beyond the already-present
  `is_trip_member` RPC and `security_audit_log` table.
