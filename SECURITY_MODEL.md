# Chravel Security Model (Canonical)

> Single source of truth for how Chravel isolates customer data and enforces access.
> Grounded in the **deployed** state of the production database (`Chravel`,
> Supabase project `jmjiyekmxwsxkfnqwyaa`) as of 2026-06-02, not just repo intent.
> If code and this document disagree, the code (and the live RLS policies) win —
> update this file.

---

## 1. Authorization principle

**The backend/database is the source of truth. The frontend only hides UI.**

Every access decision is evaluated server-side through this chain; a request must
pass *every* applicable layer:

```
authenticated user (Supabase JWT)
  → belongs to organization / trip / event (membership tables)
    → holds the role/permission required for the data type
      → holds the permission required for the action
        → passes row-level (RLS), API-level (edge function), realtime
          (Stream channel membership), and storage-level checks
```

No layer trusts a client-supplied `user_id`, `trip_id`, `organization_id`, or
`role`. Identity comes from the verified JWT; scope is re-derived server-side.

---

## 2. Tenant hierarchy

| Concept | Table | Tenant scope column |
|---|---|---|
| Customer / tenant | `organizations` | `id` |
| Org membership | `organization_members` | `organization_id`, `user_id`, `role`, `status` |
| Org sub-group | `organization_teams`, `organization_team_members` | `organization_id` |
| Org seat lifecycle | `organization_seats` | `organization_id`, `assigned_member_id`, `seat_status` |
| Org role policy | `organization_role_policies` | `organization_id`, `role` |
| Org billing link | `organization_subscription_links`, `organization_billing` | `organization_id` |
| Trip / event | `trips` (`trip_type` ∈ consumer\|pro\|event) | `id`, `created_by` |
| Trip membership | `trip_members` | `trip_id` (text), `user_id`, `role` |
| Trip roles (pro) | `user_trip_roles` → `trip_roles` | `trip_id` |
| Trip admins | `trip_admins` | `trip_id`, `permissions` (jsonb) |
| Chat channels | `trip_channels`, `channel_role_access` | `trip_id`, `channel_id` |

Trips can be standalone (consumer) or linked to an organization (pro/enterprise).
All tenant-owned tables carry a scope column (`organization_id`, `trip_id`, or
`channel_id`) and are filtered by RLS — never by frontend-only logic.

---

## 3. Permission model by trip type

Permissions vary by `trip_type` (see also agent-memory #8, #19):

- **Consumer** — open model. All members are equal (`consumer_member`): read/write/
  delete, no admin.
- **Pro** — role-based. Roles live in `user_trip_roles`/`trip_roles`; granular
  resource×action permissions resolved through the **generated permission matrix**.
- **Event** — organizer-only. `event_organizer` has full control; `event_attendee`
  is mostly read-only.

### Source of truth for resource/action permissions

`config/permission-matrix.json` → generated into both:
- Frontend: `src/types/permissionMatrix.generated.ts` (consumed by
  `src/lib/permissionGuard.ts`, `src/hooks/useRolePermissions.ts`).
- Edge: `supabase/functions/_shared/permissionMatrix.generated.ts` (consumed by
  `_shared/permissionGuard.ts` → `assertRoleAccess`).

Drift between the two is blocked in CI by
`scripts/check-permission-matrix-drift.mjs`. **Frontend and backend cannot diverge.**

### RLS helper functions (server-side truth)

All `SECURITY DEFINER` with `SET search_path = public`:

- `is_org_member(uuid, uuid)`, `is_org_admin(uuid, uuid)`
- `is_trip_admin(uuid, text)`, `is_trip_member(uuid, text)`
- `has_admin_permission(uuid, text, text)`, `can_access_channel(uuid, uuid)`
- `is_super_admin()` — Chravel-staff allowlist by JWT email; must match
  `src/constants/admins.ts`. Used to gate read access to audit logs.

Edge functions reuse `is_trip_member` via the shared
`supabase/functions/_shared/verifyTripMembership.ts` helper rather than
duplicating `trip_members` selects.

---

## 4. Action types

`create · read · update · delete · invite · approve · remove · broadcast ·
export · upload · download · share · assign_role · manage_billing ·
view_audit_logs`. (`impersonate` is **not** implemented.)

---

## 5. Enforcement layers

| Layer | Mechanism |
|---|---|
| Database rows | Supabase RLS policies gated by the helper functions above |
| API / mutations | ~95 Deno edge functions; each calls `requireAuth` then re-verifies tenant/resource membership server-side. Service-role usage is always paired with explicit re-verification. |
| Realtime chat | GetStream **channel membership** (`stream-ensure-membership` adds only verified trip members; `stream-reconcile-membership` removes departed members). The Stream identity token (`stream-token`) is trip-agnostic and grants no channel access by itself. |
| Voice | LiveKit tokens issued only after `is_trip_member` passes; rooms are tenant-scoped (`voice-{tripId}-{shortId}`); tokens are short-lived (15m). |
| Storage | `trip-media` bucket; object paths scoped `${tripId}/${subdir}/...`; quota + ownership enforced in `src/services/uploadService.ts`. |
| Frontend | Route guards (`ProtectedRoute`, `InternalAdminRoute`) + permission hooks. **UX only** — never the sole control. Query keys are scoped by `tripId` (`src/lib/queryKeys.ts`). |

---

## 6. Super-admin (Chravel staff)

`is_super_admin()` matches the caller's JWT email against a small founder
allowlist (mirrored in `src/constants/admins.ts` / `_shared/superAdmins.ts`).
It gates internal-admin routes and **read** access to `admin_audit_logs`. It does
not grant write access to audit logs (those are append-only; see §7). Planned
hardening: move to a DB-backed `super_admins` table with its own audit trail.

---

## 7. Audit logging

Two audit tables in `public` (see `docs/ENTERPRISE_SECURITY_READINESS.md` for the
full treatment):

- **`admin_audit_logs`** — deliberate privileged actions (org seat assign/reclaim/
  suspend/transfer via `log_org_admin_action`, moderation actions). **Append-only**:
  a `BEFORE UPDATE/DELETE` trigger (`prevent_admin_audit_mutation`) blocks mutation
  for *all* roles including `service_role`. Inserts restricted to `service_role`;
  reads restricted to `is_super_admin()`.
- **`security_audit_log`** — runtime security events (auth events, rate-limit hits,
  token issuance: `stream.token_issued`, `livekit.token_issued`). Written by
  `_shared/logSecurityEvent.ts` (and `log-auth-event`) using the table's real
  columns `(user_id, action, table_name, record_id, metadata)`.

**Known future work (not yet built):** cryptographic hash-chaining
(`prev_hash`/`event_hash`), a separate `audit` schema / external WORM sink, and a
DB-backed super-admin table. Tracked in the SOC 2 readiness doc.

---

## 8. Removed-user revocation

When a user leaves/loses access to a trip:
- DB: `trip_members` row removed → all RLS-gated reads/writes fail immediately.
- Realtime: `stream-reconcile-membership` removes them from Stream channels.
- Voice: next `livekit-token` request fails the `is_trip_member` check.
- Storage/exports: gated by the same membership at request time.

---

## 9. Change-control rule

Any change to auth, RLS, the CORS allowlist (`_shared/cors.ts`), edge-function
authorization, secret validation, or `is_super_admin`/`superAdmins` MUST run the
built-in `/security-review` and/or the `chravel-supabase-rls` skill, and keep the
paired generated artifacts (`permissionMatrix.generated.ts`, `types.ts`) in sync.
