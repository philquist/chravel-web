## Landing Hero copy + brand reorder

File: `src/components/landing/sections/HeroSection.tsx`

Reorder the top section so the ChravelApp wordmark sits above the headline, and refresh the headline + accent copy.

New order (top → bottom):
1. **ChravelApp** (gradient wordmark — currently lines 63–82, moved to top)
2. **"The Group Chat's Travel App"** (replaces "Group Travel Made Easy", line 45)
3. Subtitle: "Friends, Families, Sports, Tours, Work & More. Planning is Frustrating. **ChravelApp Alleviates that Stress.**" (replaces "Get UnFrustrated.", line 60)

Implementation:
- Move the Brand Name `<div>` block (lines 63–82) above the headline `<div>` (lines 38–47).
- Swap headline text → `The Group Chat's Travel App`.
- Swap gold accent span text → `ChravelApp Alleviates that Stress.`
- Keep all existing classes, gradients, animation delays, and text shadows untouched.
- Tighten the bottom margin on the brand block (`mb-2 tablet:mb-3`) so it stacks cleanly above the headline, and drop the headline's own top spacing if needed for rhythm.

No other files affected. No logic, routing, or asset changes.