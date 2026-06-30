## Goal

Swap two of the marketing landing section backgrounds for new high-DPI images in the existing black-and-gold cinematic style:

1. **Section 3 — "How It Works"** (currently `bgMountain`): replace with a new **wedding/celebration** background inspired by the attached vineyard wedding photo (string lights, pergola, golden-hour gathering) — original composition, not the attached image itself.
2. **Section 6 — "Pricing / Start free. Upgrade when you're ready"** (currently `bgCoastline`): replace with a new **team-bus arrival** background mirroring the attached photo almost verbatim — players in **"ChravelApp"** jerseys stepping off a charter coach, coach with headset/tablet — restyled in black & gold.

Both new backgrounds rendered at the same 4-resolution responsive WebP ladder as the existing ones (1280 / 1920 / 2560 / 3840) and wired through `src/assets/landing/backgrounds.ts`.

## Implementation

1. Generate two new master images at premium quality, 1920×1280, cinematic black-and-gold tinge (deep blacks, warm gold highlights, low saturation), matching the existing `bg-coastline / bg-skyline / bg-mountain / bg-stadium` aesthetic:
   - `src/assets/landing/bg-wedding-1920.webp` — blurred-bokeh outdoor evening reception, string lights, floral arch, vineyard silhouette, gold light glow, dark moody overlay.
   - `src/assets/landing/bg-team-bus-1920.webp` — pro athletes in grey jerseys with **"ChravelApp"** wordmark exiting a charter coach, coach in foreground with headset + tablet, traffic cone, gold rim-light, black-and-gold color grade.
2. Derive the 1280 / 2560 / 3840 variants from each master so the responsive `srcSet` ladder works on all DPRs.
3. Update `src/assets/landing/backgrounds.ts`:
   - Add `bgWedding` and `bgTeamBus` `ResponsiveBackground` exports built the same way as the existing ones.
4. Update `src/components/landing/FullPageLanding.tsx`:
   - Section 3 (How It Works): `backgroundImage={bgWedding}`.
   - Section 6 (Pricing): `backgroundImage={bgTeamBus}`.
   - Keep `goldOverlay`, gradient colors, and `backgroundOverlayOpacity` unchanged so text contrast stays consistent.
5. Leave the old `bgMountain` / `bgCoastline` assets in place (still used by FAQ / Hero sections) — no deletions.

## Out of scope

- No copy changes, no layout changes, no overlay/opacity retuning beyond what's required if a quick contrast check shows white text needs it.
- No new sections, no changes to other backgrounds.

## Verification

- Scroll the landing page: section 3 shows the wedding scene, section 6 shows the team-bus scene, white headlines remain readable, no layout shift, images load progressively via `srcSet`.
