# Chravel Enterprise Security Readiness

> Plain-English answers to the security questions enterprise buyers (sports,
> touring, events, professional travel) ask. Reflects the **implemented and
> deployed** state as of 2026-06-02. Chravel is building toward SOC 2; this
> document describes a **SOC 2 readiness foundation** and is **not** a claim of
> SOC 2 certification.

---

## How does Chravel isolate customer data?

Each customer is an **organization** — the top-level isolation boundary. Every
piece of tenant-owned data is scoped by `organization_id`, `trip_id`, `event_id`,
or `channel_id`, and access is enforced by the **database**, not the app UI:

- **Row-Level Security (RLS)** on Postgres tables. A user can only read or write a
  row when a security policy — evaluated inside the database — confirms they belong
  to that organization/trip/channel and hold the required role. These checks run on
  `SECURITY DEFINER` helper functions (`is_org_member`, `is_org_admin`,
  `is_trip_member`, `is_trip_admin`, `can_access_channel`) with a pinned
  `search_path` to prevent injection.
- **Backend authorization** in ~95 edge functions. Every sensitive operation
  re-verifies membership server-side from the authenticated session — it never
  trusts an organization, trip, role, or user id sent by the client.
- **Scoped realtime.** Chat runs on GetStream with **per-channel membership**: a
  user is added to a trip's channels only after their trip membership is verified,
  and is removed when they leave. The chat identity token grants no channel access
  on its own.
- **Scoped storage.** Files live under tenant-scoped paths in a private bucket with
  ownership and quota enforcement.

**Frontend hiding is UX only. The database and backend are the source of truth.**
A user cannot reach another customer's data by manipulating a URL, calling Supabase
directly, subscribing to realtime, guessing a storage path, or hitting an edge
function — each path is independently gated.

---

## How does access control work?

Access is role-based and evaluated across organization → trip/event → channel →
role → action. Roles are user-facing labels (owner, admin, manager, coordinator,
member, guest, viewer, plus domain labels like coach/tour_manager/crew); the
*permissions* behind them are system-defined in a single permission matrix
(`config/permission-matrix.json`) that is compiled into both the frontend and the
backend, with CI blocking any drift between the two.

### Role × action matrix (baseline)

| role | view | create | update | delete | invite | broadcast | export | view_audit_logs |
|---|---|---|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | org-scoped ✅\* |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | org-scoped ✅\* |
| manager / coordinator | ✅ | ✅ | ✅ | ✅ (own scope) | ✅ | ✅ (if granted) | ✅ | ❌ |
| member | ✅ | ✅ | ✅ (own) | ✅ (own) | ❌ | ❌ | limited | ❌ |
| guest / viewer | ✅ (scoped) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Chravel super-admin | platform support, **read-only audit access**, narrow & logged | | | | | | | ✅ |

\* Org-scoped audit visibility for enterprise admins is on the roadmap (see
remaining work); today audit-log **reads** are restricted to Chravel super-admins.
Consumer trips use an open model (all members equal, no admin); pro trips are
role-based; event trips are organizer-only.

### Resource-specific notes

- **Trips / events** — membership-gated; creators/admins manage; archived/deleted
  trips deny access.
- **Teams / channels** — org/trip admins manage; private channels require explicit
  channel membership (`can_access_channel`).
- **Calendar / tasks / polls** — role×action via the permission matrix.
- **Payments / billing** — server-side checks; billing actions are admin-gated;
  Stripe customer↔organization mapping is derived server-side; entitlement changes
  are audit-logged.
- **Media / files** — tenant-scoped paths, quota + ownership enforced, private
  bucket, signed access.
- **Broadcasts** — admin/authorized senders only; recipients scoped to the trip/org.
- **AI Concierge** — operates within the caller's verified trip scope; writes go
  through a confirmable pending-actions buffer; tool calls are rate-limited and
  agent sessions use short-lived, tool-scoped signed assertions.
- **Exports** — contain only data the requester is authorized to see.
- **Admin settings** — internal-admin routes gated by `is_super_admin()`.
- **Audit logs** — read-restricted (see below).

---

## How are audit logs handled?

Two separated, purpose-built logs in the database:

- **`admin_audit_logs`** — deliberate privileged actions (e.g. organization seat
  assign/reclaim/suspend/transfer, moderation). It is **append-only**: a database
  trigger blocks UPDATE and DELETE for *every* role, including the service role and
  the table owner. Writes are restricted to the service role; reads are restricted
  to Chravel super-admins. (Verified in production: update and delete both rejected.)
- **`security_audit_log`** — runtime security events: authentication events,
  rate-limit hits, and capability-token issuance (`stream.token_issued`,
  `livekit.token_issued`).

**What is logged:** auth events, member/role changes (via DB triggers), privileged
org admin actions, token issuance, entitlement/billing changes, account-deletion
processing, and webhook receipt.

**Where stored & how separated:** both live in the application Postgres database in
dedicated tables with their own RLS, distinct from mutable product tables. They are
queryable by date, actor, action, resource, and outcome via the indexed columns.

**Who can query:** Chravel super-admins (platform support), narrowly and itself
auditable. Enterprise-admin org-scoped read access is on the roadmap.

**Current limits / future SOC 2 improvements:** append-only enforcement currently
covers `admin_audit_logs` (trigger) and is being extended to `security_audit_log`;
cryptographic **hash-chaining** (`prev_hash`/`event_hash`) for tamper-evidence, a
**separate `audit` schema**, and an **external write-once (WORM) log sink** are
planned but not yet implemented.

---

## What SOC 2 controls are supported today?

| SOC 2 readiness area | Current support |
|---|---|
| **Access control** | RLS on tenant tables; backend re-verification; role-based permission matrix with enforced frontend/backend parity; least-privilege service-role usage |
| **Change management** | Timestamped, linted migrations; CI gates (lint/typecheck/build, schema-drift, permission-matrix parity, secret scan, CodeQL); paired-artifact drift checks |
| **Logical access review** | Membership tables with status + removal; super-admin allowlist; removed-user revocation across DB/realtime/voice/storage |
| **Audit logging** | Append-only admin audit log + runtime security-event log, read-restricted |
| **Incident investigation** | Queryable, indexed audit trails by actor/action/resource/time |
| **Data protection** | Secrets server-only; OAuth tokens encrypted at rest; HMAC-verified webhooks; private storage |
| **Vendor / system boundaries** | Documented integration scopes (Supabase, GetStream, LiveKit, Stripe, Google) with backend-only credential handling |

---

## What remains before formal SOC 2?

This is a **readiness foundation**, not certification. Remaining work:

- Written security policies (access control, change management, IR, data
  retention).
- Formal vendor/sub-processor risk review.
- Periodic, evidenced access reviews (org membership + super-admin).
- Documented incident-response plan and runbooks.
- Backup / disaster-recovery evidence and testing cadence.
- Hash-chaining + external WORM audit-log sink; extend append-only enforcement to
  `security_audit_log`; DB-backed super-admin table.
- Third-party penetration test.
- Continuous security monitoring/alerting.
- Engagement with a SOC 2 auditor and the observation/audit period.

---

## One-paragraph summary for buyers

> Each customer's data lives behind an organization boundary enforced inside the
> database with row-level security, re-checked by every backend operation, and
> mirrored in scoped chat, voice, and file access. Roles map to system-defined
> permissions that the frontend and backend cannot disagree on. Privileged actions
> are written to an append-only audit log that not even the service role can alter,
> and removing a user instantly cuts their access across the database, chat, voice,
> and storage. Chravel has a SOC 2 readiness foundation in place and a clear,
> documented path to formal certification.
