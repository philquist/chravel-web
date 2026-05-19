## Goal
Ship multi-base-camp support in the Places tab (shared **Trip Base Camps** + private **Personal Base Camps**), keeping the single-base-camp UI clean and preserving existing trips. Fix the related "infinite recursion in policy for relation `trips`" RLS bug exposed in the screenshot, which is currently blocking *any* basecamp save.

## Current state (verified)
- Migration `20260518120000_add_multi_base_camps.sql` already creates `trip_base_camps` and `trip_personal_base_camps` with full schema (label, place_name, address, google_place_id, lat/lng, city/region/country, start_date, end_date, order_index, notes), RLS via `is_trip_member` / `can_manage_trip_content`, and backfill from legacy `trips.basecamp_*`.
- `src/hooks/useMultiBaseCamps.ts` has `useTripBaseCamps`, `usePersonalBaseCamps`, `useCreateTripBaseCamp` — but **no update/delete/reorder, no personal create/update/delete, no current-camp resolver**.
- `BasecampsPanel.tsx` (515 lines) + `DirectionsEmbed.tsx` (285 lines) + `BasecampContext` still operate on a single `BasecampLocation`. Save path goes through `useUpdateTripBasecamp` → `basecampService.setTripBasecamp` writing to legacy `trips.basecamp_*` columns — which is what trips the infinite-recursion RLS policy.
- Demo mode uses `demoModeService` session storage; must be mirrored for the new lists.
- Downstream consumers of basecamp data: `tripContextAggregator`, `tripExportDataService` (PDF recap), AI Concierge prompt assembler, `AddPlaceModal`, `DirectionsEmbed`, `LinksPanel` ancestors.

## Plan

### 1. Fix the blocking RLS recursion (separate migration, ship first)
- Inspect `pg_policies` on `trips` and helper functions (`is_trip_member`, `can_manage_trip_content`). The recursion is almost certainly a `trips` policy that re-queries `trips` (or a function that does). Convert offending policy to a `SECURITY DEFINER` helper or to query `trip_members` directly.
- Verify legacy `useUpdateTripBasecamp` (writes `trips.basecamp_*`) succeeds again so existing single-basecamp users aren't blocked while multi-camp UI rolls out.

### 2. Data layer — extend `useMultiBaseCamps.ts`
Add typed hooks with stable query keys + targeted invalidation:
- `useUpdateTripBaseCamp`, `useDeleteTripBaseCamp`, `useReorderTripBaseCamps` (batch order_index update).
- `useCreatePersonalBaseCamp`, `useUpdatePersonalBaseCamp`, `useDeletePersonalBaseCamp`.
- `useCurrentTripBaseCamp(tripId)` / `useCurrentPersonalBaseCamp(tripId)` wrapping a pure `resolveCurrentBaseCamp(camps, now, tz)` util (today-in-range → next upcoming → last; trip timezone falling back to device).
- Demo-mode branch: read/write through `demoModeService` instead of Supabase, mirroring `usePersonalBasecamp` patterns.

### 3. Compatibility shim
- New util `flattenLegacyBasecamp(trip)` returns a single-item array so any consumer that only knows about one basecamp keeps working.
- `useTripBaseCamps` returns the list from `trip_base_camps`; if empty, falls back to legacy `trips.basecamp_*` via shim (covers period before backfill runs in customer DBs).
- Keep `useTripBasecamp` exported as a deprecated thin wrapper around `useCurrentTripBaseCamp` so we don't have to touch every consumer at once.

### 4. UI refactor (Places → Base Camps)
New components in `src/components/places/basecamps/`:
- `BaseCampList` — ordered timeline; renders chips like "Kyoto · Jun 3–7".
- `BaseCampCard` — read row with Edit/Delete; current camp gets a gold "Current" pill (`CurrentBaseCampBadge`).
- `BaseCampEditor` — reuses existing `BasecampSelector` Google Places autocomplete + adds label, start/end dates, optional notes.
- `BaseCampSelector` (chooser) — used by Directions; lists Trip + Personal camps grouped, plus "Custom location".
- `BasecampsPanel` rewritten thin shell:
  - Shared card → if 0 camps: empty state with single "Set Trip Base Camp"; if 1: same look as today; if 2+: ordered list with "Add another base camp" + reorder via up/down buttons (no DnD dep).
  - Personal card → same pattern, scoped to current user.
- Preserve premium Luxury Dark / gold palette; min-h-[42px] buttons; no emerald/orange.

### 5. Directions
- `DirectionsEmbed` swaps hardcoded "Trip Base Camp" link for `<BaseCampSelector>` for From and To.
- Default From = current personal camp if present, else current trip camp.
- Disable "Get Directions" until both endpoints resolve.
- Add `toDirectionsLocation(camp)` util producing `{ lat, lng } | { query: address }`; reuse existing Google Maps deep-link helper, just adapted to a generic location source.

### 6. Downstream context
- `tripContextAggregator` + concierge `promptAssembler`: include **all** trip + personal camps in chronological order, marking the current one.
- `tripExportDataService` (PDF recap): render itinerary section using `BaseCampList` data; fall back to legacy field if empty.

### 7. Mobile / native
- Same components, stack vertically under `md:`; date chips wrap; selector renders as bottom-sheet (`Sheet` from shadcn) on `sm:`.
- Confirm Capacitor map deep links still open via existing helper.

### 8. Validation
- `npm run lint && npm run typecheck && npm run build`
- New unit tests: `resolveCurrentBaseCamp` (in-range, gap, missing dates, tz boundary), `useMultiBaseCamps` mutations (with msw or vi mocks), Directions default-origin selection.
- Manual QA matrix: 0/1/many camps; personal camp visibility from second test user; reorder; delete; offline; demo mode; Japan trip tz; PDF recap.
- Supabase linter run after migration; verify RLS via `psql` with two test users.

### Out of scope (deferred follow-ups will be listed in delivery footer)
- Drag-and-drop reorder UI (use ▲▼ for now).
- Sharing personal base camp with selected members.
- Calendar auto-creating "Travel day" events between consecutive camps.

## Technical notes
- Query keys: `['tripBaseCamps', tripId]`, `['personalBaseCamps', tripId, userId]` (already used).
- All new writes use the authenticated supabase client (RLS enforced); no service role.
- `trip_id` is `TEXT` in the new tables (legacy schema), not UUID — keep that to match `trip_base_camps` definition.
- Timezone helper: prefer `trips.timezone` if present, else `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- No new dependencies.

## Files expected to change
- `supabase/migrations/<new>_fix_trips_rls_recursion.sql` (new)
- `src/hooks/useMultiBaseCamps.ts` (extend)
- `src/hooks/useCurrentBaseCamp.ts` (new)
- `src/utils/baseCamps.ts` (new — resolver + formatters + directions adapter)
- `src/components/places/basecamps/*` (new folder, ~5 files)
- `src/components/places/BasecampsPanel.tsx` (rewrite as thin shell)
- `src/components/places/DirectionsEmbed.tsx` (selector-driven)
- `src/services/demoModeService.ts` (add list CRUD for camps)
- `src/services/tripContextAggregator.ts`, `src/services/tripExportDataService.ts`, `supabase/functions/_shared/concierge/promptAssembler.ts` (consume list)
- Tests under `src/utils/__tests__/` and `src/hooks/__tests__/`

Approve and I'll implement in order: RLS fix migration → data hooks → components → directions → downstream → tests.
