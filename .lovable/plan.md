# Coordinator Access for Pro Trips + Copy + Billing Story

Three-part release, one branch: (A) ship the generic **Coordinator Access** permission model on Pro Trips, (B) rewrite the travel-concierge + wedding use-case articles and hub copy around it, (C) publish the billing model that answers "who pays for Pro" for concierge companies, couples, and organizations.

Same universal Pro layout for every use case — no concierge-only shell, no new tabs.

---

## Part A — Coordinator Access (permissions)

**Design (no new tables).** Extend `trip_admins.permissions` JSONB with `admin_scope: 'full' | 'coordinator'` plus capability flags. Every existing admin is backfilled to `full` — zero behavior change for current trips.

**Server-side (one migration).**
- Backfill `admin_scope='full'` on all `trip_admins.permissions` (idempotent `jsonb_set`, `create_missing=true`).
- Extend default JSON with: `can_manage_shared_calendar`, `can_manage_shared_tasks`, `can_manage_shared_places`, `can_manage_shared_files`, `can_manage_shared_links`, `can_invite_members`. Full = all true; coordinator template = all true except `can_invite_members=false` and no admin-bypass reads.
- New SECURITY DEFINER helpers: `is_full_trip_admin(_user, _trip)`, `is_trip_coordinator(_user, _trip)`, `has_coordinator_capability(_user, _trip, _cap)`.
- Update `get_trip_admin_permissions` → return `admin_scope` + capability flags.
- Update `get_trip_mutation_permissions` + `can_manage_trip_content` so coordinators keep logistics write on `trip_events`, `trip_tasks`, `trip_places`, `trip_links`, `trip_polls` but never gain `admin`.
- Extend `promote_to_admin(_trip, _target, _scope default 'full')` (backward compatible) + new `set_admin_scope` RPC.
- **Rewrite every admin-bypass read** that uses a bare `EXISTS trip_admins` to use `is_full_trip_admin`. Grep-audited targets: private `channel_members` / `channel_messages` policies (esp. `20251210000000_fix_role_channels.sql`, `20260113100000_fix_role_channel_sync.sql`), `trip_files` private-visibility, `trip_chat_messages` admin-read, `event_qa_questions`, `join-trip` / `approve-join-request` / `stream-moderation-action` edge functions, `export-user-data` / trip-recap. Logistics-write policies keep coordinator access.
- Verify `ai_queries` + `concierge_conversation_sessions` are strictly `user_id = auth.uid()` (no admin bypass); remove any that exist.

**Client (no new layout).**
- `useProTripAdmin`: expose `adminScope`, `isFullAdmin`, `isCoordinator`, capability booleans.
- `useTripAdmins.promoteToAdmin(userId, { scope })` + new `setAdminScope`.
- Regenerate `config/permission-matrix.json` → add `pro_coordinator` role (logistics write, no delete on polls, no admin, no basecamp admin) → run `scripts/generate-permission-matrix.mjs` and `check-permission-matrix-drift.mjs`.
- **UI touch-points only** (no new pages): in the Team tab promote dialog and the invite-member dialog, add a "Coordinator" option next to "Full admin" with helper text: *"Coordinator lets a planner, assistant, travel concierge, or outside organizer manage shared logistics — calendar, places, tasks, files, links — without seeing private chats, AI Concierge activity, or private media."* Show a "Coordinator" pill on roster rows where `admin_scope='coordinator'`.

**Tests.** Vitest + SQL policy tests (12): full-admin regression; coordinator write on events/tasks/places/links; coordinator blocked on private channel `SELECT`; blocked on other users' `ai_queries`; blocked on private `trip_files`; export excludes private surfaces; invite gated by capability; `promote_to_admin` default keeps `full`; trips without coordinator behave identically (snapshot); `useMutationPermissions` returns correct booleans for `pro_coordinator`; matrix drift check passes.

**Files to change.** New migration under `supabase/migrations/`; `config/permission-matrix.json` + generated TS/SQL; `src/hooks/useProTripAdmin.ts`, `useTripAdmins.ts`, `useMutationPermissions.ts`; existing promote/invite dialogs under `src/features/pro/**` and Team tab; `scripts/verify_auth.ts` extended.

---

## Part B — Use-case copy rewrite

All copy lives in `src/lib/useCases.ts` (single source, already SEO-wired via `UseCasePage.tsx` + `UseCasesHub.tsx`). No new routes.

**B1. `travel-concierge-client-portal`** — rewrite around the Coordinator Access promise. Add a dedicated **"What your clients see vs. what you see"** section with a two-column comparison:

| Client (Full member) | You (Coordinator) |
|---|---|
| Private chat with their family / party | ❌ Not visible |
| Their personal photos & camera-roll uploads | ❌ Not visible |
| Their AI Concierge questions & answers | ❌ Not visible |
| Shared calendar, itinerary, base camps, tasks, places, links, shared docs | ✅ You manage these |

Add a "Privacy guarantee" callout (enforced by RLS at the database, not just UI). Add a "How you set it up" 3-step block: create the Pro Trip → invite the client as Full Member → invite yourself/your team as Coordinator. Update FAQ with: "Can you read our chats?" "Can you see our photos?" "Who owns the trip if we leave you?"

**B2. `wedding-guest-coordination-app`** — reposition weddings as a **Pro Trip** use case (not a Consumer trip). New copy explains channel-per-audience: bride's family, groom's family, wedding party, caterers/vendors, full guest list, planner-only. Coordinator access is the wedding-planner story: the planner runs logistics without living inside the couple's private family chats. Update FAQ: "Can our planner see our family chat?" → No, unless invited.

**B3. `UseCasesHub.tsx` intro + FAQ** — expand the "who is this for" answer to explicitly name travel concierges, wedding planners, tour managers, sports coordinators, corporate assistants, family-office staff. Add a hub FAQ: *"Can an outside organizer help run our trip without seeing our private conversations?"* → Yes, Coordinator Access.

**B4. Consistency sweep.** Update `UseCasesSection.tsx` card blurbs for weddings + concierge to match. No changes to other slugs.

---

## Part C — Billing model ("who pays for Pro?")

**Decision to publish (both can pay, no double-charging on the same trip):**

1. **Concierge / planner company pays** → they buy `pro-growth` (or `pro-enterprise` for >5 seats) and get **Pro Trip creation + Coordinator seats**. Each trip they run counts as one Pro Trip against their seat pool. Clients invited as Full Members do **not** need a paid account to participate in that trip (mirrors today's Pro Trip guest model). This is the default sell for concierges, wedding planners, tour managers, sports orgs, corporate assistants.
2. **Client / couple / organization pays** → they buy `pro-growth` themselves because they want channels + roles for their own weekend/tour/retreat, and they invite outside help (planner, family assistant, tour vendor) as **Coordinator** — coordinators don't need their own paid seat when joining a paid trip.
3. **Both pay** → totally supported. A frequent traveler can hold a personal `frequent-chraveler` subscription for their own trips, and separately be invited as a Full Member into a Pro Trip their concierge runs. Independent billing entities, no conflict.

**Rule:** billing follows *who created the Pro Trip*. Every Pro Trip must be owned by one paid Pro account (individual or organization). Coordinators and guests inherit access for that trip only.

**New Enterprise line: "Pro for Concierge & Planners."** Same `pro-enterprise` SKU, positioned as: multi-client concierge pricing (per-coordinator-seat + volume Pro Trips), white-glove onboarding, contract terms. Contact-sales only — no new Stripe product this pass.

**Implementation for Part C.**
- No new Stripe products/prices this release. Reuse `pro-starter`, `pro-growth`, `pro-enterprise`.
- Update `src/components/conversion/PricingSection.tsx` Pro tier copy: bullet "Invite coordinators (planners, concierges, assistants) — they don't need a seat." Bullet "Bring clients or guests in as full members at no extra cost per trip."
- Add a "Who pays?" table to the concierge + wedding use-case articles (rendered inline from `useCases.ts`).
- New `/for-teams` block (edit `src/pages/ForTeams.tsx`) surfacing the three billing paths above with CTAs: **"Buy Pro" / "Talk to sales" / "Bring your planner in as a coordinator."**
- Business rule audit only (no schema): confirm existing seat/entitlement counting in `src/billing/entitlements.ts` treats coordinators as non-billable seats. If today it counts every `trip_admins` row as a paid seat, add a check that skips `admin_scope='coordinator'`. Small, surgical.

---

## Sequencing & risk

Land in this order behind the existing feature-flag pattern:
1. Migration + regenerated types + matrix — merge, monitor RLS.
2. Client hooks + Team tab UI — behind no flag; additive only.
3. Copy + pricing surfaces — pure content, ship anytime after (1).
4. Entitlement seat-count tweak — last, with billing regression tests.

**Highest risk:** the RLS admin-bypass rewrite. Mitigation: full enumeration via `rg "EXISTS.*trip_admins"`, replace with `is_full_trip_admin`, run `scripts/verify_auth.ts` extended for coordinator scenarios against staging before deploy.

## Non-goals

New layout, concierge dashboard, white-label, booking, supplier CRM, new Stripe SKUs, per-seat metered billing, channel seed templates, new category. Wedding-website replacement is explicitly *not* the pitch.

## Definition of done

- Coordinator can be invited/promoted from Team tab; roster shows the pill.
- SQL tests prove coordinator cannot read private channels/messages/AI/private media/export.
- `travel-concierge-client-portal`, `wedding-guest-coordination-app`, and Use-Cases Hub copy live with the privacy comparison table + "Who pays?" answer.
- `PricingSection` and `ForTeams` reflect the three billing paths.
- `npm run lint && npm run typecheck && npm run build` + full vitest green.
