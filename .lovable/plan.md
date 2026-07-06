## Goal

Bring the newly-shipped Coordinator/Roles work into a polished, premium-feeling surface for luxury concierges and pro orgs. Two entry points, one mental model:

1. **Team tab** — day-to-day: see roles, see who the Coordinator is, add/remove Coordinators.
2. **Pro Trip Settings → Travel Company** — trip-level: attach the org running the trip and (optionally) mark the org's own people as Coordinators so they get logistics-only scope on their own client's trip.

Both call the same `useTripAdmins` scope logic (RLS already enforces the `is_full_trip_admin` boundary from the last migration).

## What ships

### 1. Team tab — Coordinator visibility polish
File: `src/components/pro/team/RolesView.tsx`

- Add a **Coordinator strip** above the roster (shown when `pro_coordinator_role` flag is on) listing current Coordinators as avatar chips with a `Manage` button that opens the existing `CoordinatorInviteDialog`.
- On each roster card, if the member is a Coordinator, show a small amber `Coordinator` pill next to their name (source: `admins` where `admin_scope === 'coordinator'`).
- Empty state chip: "Add a Coordinator — outside organizer, logistics-only access." Clicking opens the dialog.
- No new dialogs — reuse `CoordinatorInviteDialog`.

### 2. CoordinatorInviteDialog — clarity + premium polish
File: `src/components/pro/admin/CoordinatorInviteDialog.tsx`

- Replace the raw UUID in "Current coordinators" with the roster's display name + avatar (join `admins` ↔ `roster` by `userId`).
- Add a "What Coordinators can do / can't do" two-column panel (Calendar, Tasks, Places, Links vs. Private chat, AI Concierge, Private media) — the same boundary the article now sells.
- Tighten spacing, use `Card`/section headers consistent with settings polish.
- Add a secondary tab/toggle: **Add by email** (invite an outside organizer who isn't in the roster yet) — reuses the existing invite-link/email flow already used for member invites; the invitee joins with Coordinator scope pre-set. If that flow doesn't cleanly accept a role hint, we fall back to a two-step "send invite → auto-promote on accept" using a `pending_coordinator_invites` field on the invite row. **Scope call-out below.**

### 3. Pro Trip Settings → Travel Company section (new)
Files: `src/components/EnterpriseSettings.tsx` (add a section), new `src/components/pro/settings/TravelCompanySection.tsx`

- New settings section titled **Travel Company** (shown on Pro trips only).
- Row 1: **Organization** — dropdown of the user's orgs (from existing `useOrganizations`/enterprise data) + "Create organization" link that opens the existing `CreateOrganizationModal`. Persists `trip.organization_id`.
- Row 2: **Coordinators from this organization** — searchable list of org members with a per-row `Assign as Coordinator` toggle. Same underlying `promoteToAdmin(userId, { scope: 'coordinator' })` call; org members not yet on the trip are added to the trip first (existing invite flow) then promoted.
- Row 3: **Boundary explainer** — short static block mirroring the article: "Coordinators manage logistics. They cannot read private family chat, AI Concierge, or private media."
- If the current user is the trip creator AND part of the selected org, offer a one-click **"Assign myself as Coordinator"** button so a concierge owner can voluntarily downgrade themselves for a given client trip.

### 4. Premium visual pass (settings-only, no logic changes)
- Consistent card chrome: `bg-white/[0.04] border border-white/10 rounded-2xl`, section header with small gold icon square (matches OrganizationSection header pattern).
- Tighter vertical rhythm (`space-y-6` inside sections, `gap-4` in grids).
- Use existing `gold-primary`/`gold-mid` tokens — no new colors.
- Scope: Pro Trip Settings + Team tab Coordinator surfaces only. No changes to consumer settings, chat, calendar, etc.

### 5. Wiring & data
- `trip.organization_id` column: check `trips` schema; if missing, add a migration (nullable uuid ref → organizations, index, RLS unchanged). **Scope call-out below.**
- No RLS changes — Coordinator boundary already enforced by prior migration.
- Feature flag `pro_coordinator_role` continues to gate all Coordinator UI.

## Files touched

```
src/components/pro/team/RolesView.tsx                (Coordinator strip + pill)
src/components/pro/admin/CoordinatorInviteDialog.tsx (names, boundary panel, add-by-email)
src/components/pro/settings/TravelCompanySection.tsx (new)
src/components/EnterpriseSettings.tsx                (mount new section on Pro trips)
src/components/enterprise/OrganizationSection.tsx    (minor: shared header pattern, no behavior change)
supabase/migrations/<new>.sql                        (only if trips.organization_id missing)
```

## Out of scope (call out before I code)

- **DB migration for `trips.organization_id`** — I'll confirm whether the column exists before writing SQL; if it does, no migration ships in this pass.
- **Add-by-email Coordinator invite** — depends on the current invite flow supporting a role hint. If it doesn't, I'll ship the roster-based promotion in this PR and file a follow-up for email invite, rather than expand scope.
- No changes to the blog article, marketing pages, or consumer trip settings.
- No changes to permission-matrix.json (Coordinator role already added in prior turn).

## Validation

- `npm run lint && npm run typecheck && npm run build`
- Manual: on a Pro trip, promote a roster member to Coordinator from both entry points, confirm pill/strip render, confirm dialog shows names not UUIDs, confirm boundary explainer matches article language.
