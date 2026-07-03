
# AI Trip Cover Photos + Permission Hardening

## Scope

Two related changes shipped together:

1. **Permission hardening** on trip cover photo edits — matches the described model.
2. **AI cover photo generation** — Frequent Chraveler benefit, hard-capped at 10/month, one-click auto-prompt from trip title + location, via Lovable AI Gateway (`openai/gpt-image-2`, low quality).

## Cost Analysis

| Item | Value |
|---|---|
| Model | `openai/gpt-image-2`, `quality: "low"`, 1024×1024 |
| Per-image cost (est.) | ~$0.01–0.02 |
| Cap per FC user | 10/month → **$0.10–$0.20/user/mo** max |
| Revenue per FC user | $20/mo → **>99% gross margin on this feature** |
| Blast-radius if 1,000 FC users max out | ~$100–$200/mo total |

Trivial cost. Cap exists to prevent abuse, not to protect margin.

## Permission Model (enforced client + DB)

| Trip type | Who can change cover |
|---|---|
| Consumer | Any trip member |
| Pro | Creator + Pro Admin only |
| Event | Creator + Event Organizer only |

- Client: guard in `TripCoverPhotoUpload` and any cover-edit entry points using existing role hooks (`useTripRole` / `useUserTripRole` / `trip_admins` / organizer check).
- DB: tighten RLS `UPDATE` on `public.trips.cover_image_url` via a `SECURITY DEFINER` helper `can_edit_trip_cover(trip_id, user_id)` returning boolean based on trip category + membership/role. Storage RLS on `trip-covers` mirrors the same helper so uploads can't bypass by writing directly to storage.
- Verify existing behavior end-to-end: today any member can update covers on all trip types. This is a regression fix for Pro/Event.

## AI Generation — Where It Lives

**Both surfaces, one backend** (recommended for discoverability + power-user flow):

1. **Primary — inside the cover photo modal**: `Generate with AI ✨` button next to Upload. Visible to all users; **disabled with an upsell tooltip** for non-FC users. Shows remaining monthly count ("7 of 10 left this month").
2. **Concierge tool**: register `generate_trip_cover_photo` in `supabase/functions/_shared/concierge/toolRegistry.ts`. User can say "make a cover photo for this trip" — tool reads trip context, generates, applies to trip, replies with preview.

Both paths call the **same edge function**, which is the single source of truth for entitlement + quota + generation + upload.

## Backend Architecture

### New edge function: `generate-trip-cover`

Location: `supabase/functions/generate-trip-cover/index.ts`

Flow:
1. `requireAuth` → user JWT.
2. Load trip; run `can_edit_trip_cover(tripId, userId)` — reject if false.
3. Resolve tier via `resolveEffectiveTier(userId)` — reject if not `frequent-chraveler` (and not super admin).
4. Check + increment monthly counter in `ai_cover_generations` (see schema). Reject with `quota_exceeded` if at cap.
5. Build prompt from `trip.title` + `trip.destination` + `trip.category`:
   > "A stunning cinematic travel photograph of {destination} evoking {title}. Wide landscape composition, golden hour lighting, editorial quality, no text, no logos, no watermarks."
6. Call Lovable AI Gateway `/v1/images/generations` with `openai/gpt-image-2`, `quality: "low"`, `size: "1536x1024"` (landscape suits cover), `stream: false` (server job → single JSON).
7. Decode `b64_json` → upload via `uploadTripCoverBlob` → write `cover_image_url` (reuse the same normalized public URL path `useCoverPhotoUpload` uses).
8. Return `{ publicUrl, remaining }`.

Failure = counter is NOT incremented (increment only after successful upload).

### New table: `ai_cover_generations`

```sql
CREATE TABLE public.ai_cover_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL,
  period_month date NOT NULL,  -- first day of month, for cheap monthly counting
  created_at timestamptz NOT NULL DEFAULT now(),
  cost_estimate_cents integer,
  model text NOT NULL DEFAULT 'openai/gpt-image-2'
);
CREATE INDEX ON public.ai_cover_generations (user_id, period_month);

GRANT SELECT ON public.ai_cover_generations TO authenticated;
GRANT ALL ON public.ai_cover_generations TO service_role;
ALTER TABLE public.ai_cover_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.ai_cover_generations FOR SELECT
  TO authenticated USING (user_id = auth.uid());
-- No client INSERT policy; only the edge function (service_role) writes.
```

Monthly count query: `SELECT count(*) WHERE user_id = $1 AND period_month = date_trunc('month', now())::date`.

### New feature flag

`ai_cover_generation_enabled` (kill switch, default `true`).

## Frontend Changes

- `src/features/trips/hooks/useCoverPhotoUpload.ts` — untouched (still the single upload owner for direct uploads).
- **New hook** `src/features/trips/hooks/useGenerateCoverPhoto.ts`:
  - Calls `generate-trip-cover` edge function.
  - Invalidates cover query surfaces via existing `invalidateTripCoverQueries`.
  - Exposes `{ generate, isGenerating, remainingThisMonth, error }`.
- **New hook** `src/features/trips/hooks/useCoverEditPermission.ts` — returns boolean based on trip category + role, single source used by all cover-edit surfaces.
- **UI** — `src/features/trips/components/TripCoverPhotoUpload.tsx` (existing):
  - Add `Generate with AI ✨` button, gated:
    - Hidden if `!canEditCover`.
    - Disabled + upsell tooltip if not FC tier ("Upgrade to Frequent Chraveler to generate covers").
    - Disabled if `remaining === 0` ("You've used all 10 AI covers this month").
  - Show `remaining/10` counter.
  - Loading state during generation; final image slots into the same preview as manual uploads.
- **Concierge tool** — `generate_trip_cover_photo`:
  - Inputs: none (uses current tripId from context).
  - Same 5-file sync (memory #23, #26): tool registry, prompt catalog, handler, allowlist, docs.
  - Handler calls the same edge function.

## Files Changed

| Path | Change |
|---|---|
| `supabase/migrations/<ts>_ai_cover_generations.sql` | New table + RLS + grants |
| `supabase/migrations/<ts>_trip_cover_permission.sql` | `can_edit_trip_cover()` SECURITY DEFINER + tighter `trips` UPDATE RLS + `trip-covers` storage RLS |
| `supabase/functions/generate-trip-cover/index.ts` | New edge function |
| `supabase/functions/_shared/concierge/toolRegistry.ts` (+ 4 paired files) | Add `generate_trip_cover_photo` |
| `src/features/trips/hooks/useGenerateCoverPhoto.ts` | New |
| `src/features/trips/hooks/useCoverEditPermission.ts` | New |
| `src/features/trips/components/TripCoverPhotoUpload.tsx` | Add Generate button + gating + counter |
| Any other cover-edit entry points (TripHeader edit action, CreateTripModal cover step) | Wrap with `useCoverEditPermission` |
| `src/lib/featureFlags.ts` seed (via migration) | `ai_cover_generation_enabled` |

## Rollout & Verification

1. Migrations first (table + RLS) — no user-facing change.
2. Deploy edge function.
3. Ship UI behind `ai_cover_generation_enabled` flag.
4. Manual QA matrix:
   - Consumer member: can upload ✓, cannot generate unless FC ✓.
   - Consumer FC member: can generate up to 10/mo, blocked at 11 ✓.
   - Pro non-admin: cannot upload or generate ✓ (regression fix).
   - Pro admin/creator: can upload ✓, can generate if FC ✓.
   - Event attendee: cannot upload or generate ✓ (regression fix).
   - Event organizer/creator: can upload ✓, can generate if FC ✓.
   - Super admin: bypasses all gates.
5. Storage RLS test: attempt direct upload to `trip-covers` bypassing UI — must be rejected for non-permitted role.

## Risks

| Risk | Mitigation |
|---|---|
| RLS regression locks out legitimate consumer members | Ship migration + client change in same PR; QA all 6 roles above |
| Gateway rate limit / 402 credits | Surface error, don't increment counter, show clear message + link to buy credits |
| Prompt produces text/logo artifacts | Explicit "no text, no logos, no watermarks" in prompt; if user unhappy they can regenerate (counts against cap) |
| Users spamming regenerations | Hard 10/mo cap enforced server-side, not client — bypass-proof |

## Deferred to follow-up

- Multi-variant generation (3 options) — user chose one-click; skip for v1.
- Style/vibe text refinement — user chose one-click; skip for v1.
- Explorer tier access — user chose FC-only; skip.
