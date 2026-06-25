## Update app icons to new gold Chravel logo

Use the uploaded square gold icon (1st image) as the master source for all platform icons. The PWA/favicon circular crops can be derived from it via masking.

### Source asset
- Master: `user-uploads://7ADFCE86-41B1-4CB1-A82D-FF67C6EDAEF3.png` (1252×1252, square w/ rounded corners on black)
- Save master at `src/assets/chravel-icon-master.png` (via lovable-assets pointer) and also write a flat 1024×1024 PNG for native toolchains.

### Web (favicon + PWA) — `public/` + `index.html`
Generate from master:
- `public/favicon.ico` (multi-size 16/32/48, circular crop)
- `public/favicon-16.png`, `favicon-32.png`, `favicon-48.png` (circular)
- `public/apple-touch-icon.png` 180×180 (squircle, no transparency — iOS adds mask)
- `public/icon-192.png`, `public/icon-512.png` (PWA, square rounded per current `manifest.json`)
- `public/icon-maskable-192.png`, `public/icon-maskable-512.png` (safe-zone padded, square)
- Update `index.html` <link rel="icon"> / `apple-touch-icon` references
- Update `public/manifest.json` icon entries + `theme_color` if needed (keep existing gold/black)

### iOS — Capacitor / Xcode asset catalog
- Regenerate `ios/App/App/Assets.xcassets/AppIcon.appiconset/` PNGs at all required sizes (20/29/40/60/76/83.5 @1x/2x/3x + 1024 marketing) — full squircle, opaque background (Apple rejects alpha).
- Update `appstore/` 1024 marketing icon referenced in `appstore/ASSETS_CHECKLIST.md`.
- Run `npx cap sync ios` note for user (manual on their machine).

### Android — Capacitor
- Regenerate `android/app/src/main/res/mipmap-*/ic_launcher.png`, `ic_launcher_round.png`, and `ic_launcher_foreground.png` (adaptive) at mdpi→xxxhdpi.
- Background layer stays solid black (matches brand), foreground = gold icon with 33% safe-zone padding for adaptive masking.
- Update `ic_launcher.xml` adaptive config if background color changes.

### Generation approach
Use Python/Pillow script (run once) to:
1. Load master, trim transparent border.
2. Produce square-rounded variants (iOS/Android legacy/PWA).
3. Produce circular-masked variants (favicon, PWA round).
4. Produce maskable variants (padded inside safe zone, square fill).
5. Emit ICO via Pillow.

Script saved to `scripts/generate-app-icons.py` for future re-runs; existing `appstore/scripts/generate-icons.sh` updated to call it or deprecated.

### Files touched
- `public/manifest.json`, `index.html`
- `public/favicon.ico` + new png variants
- `public/apple-touch-icon.png`, `public/icon-*.png`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/*`
- `android/app/src/main/res/mipmap-*/ic_launcher*.png`, `mipmap-anydpi-v26/ic_launcher*.xml` (only if bg changes)
- `appstore/` 1024 marketing icon + checklist note
- `src/assets/chravel-icon-master.png.asset.json`
- `scripts/generate-app-icons.py` (new)

### Verification
- `npm run build` passes.
- Visual check: favicon in browser tab, manifest icons via DevTools → Application → Manifest.
- iOS/Android: user runs `npx cap sync` locally; provide checklist.

### Out of scope
- Splash screens (separate asset). Mention if user wants those updated too.

### Question before building
Background for **iOS marketing icon (1024)**: Apple disallows transparency. Should I use **solid black** (matches your brand mockup) or **gold square w/ icon embossed** (matches the squircle itself with no surrounding black)? Recommend **gold squircle on solid black 1024** = the exact image you uploaded, which is what App Store will display.
