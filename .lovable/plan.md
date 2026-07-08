Generate the missing **Explorer Monthly** IAP review screenshot to match the existing v3 set, and deliver it as a downloadable file.

## What to build

A single PNG at `1290×2796` (iPhone 6.9" — same spec as the other 7 v3 shots) showing the Chravel paywall with **Explorer Monthly ($9.99/mo)** as the highlighted tier and an Apple-branded CTA ("Subscribe with Apple"), consistent with `docs/agentic/app-store-connect-iap-review-screenshots.md`.

## Approach

1. Launch Playwright against the local dev server at `/settings` (Billing panel) with:
   - Viewport `390×844` at `deviceScaleFactor=3.31` to render natively at 1290×2796, OR render at a workable viewport and upscale to exact 1290×2796.
   - `?app_context=native` query + iOS WKWebView user agent so `isIOSNativeShell()` returns true → forces "Subscribe with Apple" CTA (required by guideline 3.1.1).
2. Scroll/focus the Explorer Monthly card so it's the visible/highlighted plan.
3. Save to `/mnt/documents/iap-screenshots-v3/iap-08-explorer-monthly.png` and emit a `<presentation-artifact>` tag so the user can download.
4. Verify the output image visually (dimensions + CTA copy + price).

If the live paywall can't be reliably captured (auth wall, layout drift), fall back to compositing the shot using PIL with the same layout language as the existing v3 PNGs so it matches visually.

## Deliverable

- `iap-screenshots-v3/iap-08-explorer-monthly.png` (1290×2796) ready to upload to App Store Connect → Explorer Monthly → Review Screenshot.
- Update `docs/agentic/app-store-connect-iap-review-screenshots.md` table to include row 8 (Explorer Monthly) so the agentic uploader script covers all 8 IAPs.

## Not in scope

No code/billing/config changes. Purely asset generation + doc row addition.
