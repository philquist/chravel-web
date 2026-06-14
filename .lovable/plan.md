## Problem
The hero video's bottom caption ("One group chat per trip — plans never get buried", etc.) is clipped because `scale-[1.18]` with `object-cover` crops ~9% off the top/bottom of the source video, and the captions sit near the bottom edge.

## Fix (scoped to `src/components/landing/sections/HeroSection.tsx`)
Two tiny changes on both the `<video>` and poster `<img>`:

1. Reduce upscale from `scale-[1.18]` → `scale-[1.08]` so less of the bottom is cropped while still filling most of the empty space the user wanted closed up.
2. Add `object-bottom` so any remaining crop is taken off the top (browser chrome area) instead of off the caption band at the bottom.

Result: phone + desktop screens still appear large in the frame, and the rotating caption line becomes fully visible. No changes to the video file, layout, aspect ratio, or surrounding sections — so the rest of the hero is untouched.

## Files
- `src/components/landing/sections/HeroSection.tsx` — swap `scale-[1.18]` → `scale-[1.08] object-bottom` on the two media elements (lines ~98 and ~120).

## Verification
- Visual check of preview at the current viewport: caption text legible, no new empty space on the sides.
- Existing `HeroSection.video.test.tsx` assertions (src/poster/autoplay) remain unaffected.