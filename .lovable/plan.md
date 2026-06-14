# Bring back the side-by-side desktop + iPhone hero

## Root cause
- The hero video file (`public/videos/chravel-homepage-demo-60.mp4`) **is** the correct side-by-side walkthrough — rendered from `remotion/src/compositions/HomepageProductDemo60.tsx`, which composes desktop captures + phone frames (`remotion/public/captures/mobile/m-*.png`) side by side from ~4s onward.
- The poster (`chravel-homepage-demo-60-poster.jpg`) was generated at `--frame=0`, which is the desktop-only intro dashboard. That's the static image you're seeing in your screenshot — either the video hadn't started, autoplay was blocked, or `onError` swapped to the poster fallback in `HeroSection.tsx`.
- Net effect: looks like the side-by-side was removed, when it's actually just hidden behind a misleading still frame.

## Fix (presentation-only, no business logic)
1. **Regenerate the poster** from a frame that already shows the side-by-side composition (e.g. `--frame=180` ≈ 6s, the create-trip scene with phone on the right). New file: `public/videos/chravel-homepage-demo-60-poster.jpg`.
2. **Verify the MP4** still autoplays in the preview; if the side-by-side frames are missing from the current MP4, re-render via `node remotion/scripts/render-remotion.mjs ../public/videos/chravel-homepage-demo-60.mp4 HomepageProductDemo60`.
3. **No code change required in `HeroSection.tsx`** — it already references the correct `/videos/...` paths and has a poster fallback. (Optional: bump `--frame` choice in `remotion/package.json`'s `still:homepage-demo-poster` script so future regenerations stay side-by-side.)
4. **QA**: load `/` in the preview, confirm video autoplays with both desktop + phone visible, then pause / disable autoplay and confirm the poster also shows the side-by-side layout.

## Files touched
- `public/videos/chravel-homepage-demo-60-poster.jpg` (regenerated)
- `public/videos/chravel-homepage-demo-60.mp4` (only if re-render is needed)
- `remotion/package.json` (optional: update `--frame` in the poster script)

## Rollback
`git checkout` the prior poster (and MP4 if re-rendered). No app code or schema is touched.
