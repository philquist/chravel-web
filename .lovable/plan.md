## Why the old icon is still showing

The iOS App Store and Google Play do **not** pull icons from this `chravel-web` repo. This repo only controls **PWA / browser / "Add to Home Screen"** icons. The native app icons live in a **separate repo**: `chravel-mobile` (documented in `docs/mobile/SPLASH_BRANDING_HANDOFF.md`).

Evidence from this codebase:
- No `ios/` or `android/` folder exists at the repo root.
- `appstore/scripts/generate-icons.sh` writes to `$PROJECT_ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/` — that path **does not exist here**, so the script has been a no-op for native builds from this repo.
- `public/chravel-pwa-icon.png` (the "canonical" web icon per `docs/app-icons.md`) is still the **old white globe-with-mini-icons** image (482 KB, last regenerated in a previous PWA pass).
- `index.html` + `public/manifest.json` reference: `favicon.ico`, `icon-16/32/192/512.png`, `icon-maskable-192/512.png`, `apple-touch-icon.png`, `chravel-pwa-icon.png`.

### Where each store actually pulls from

| Surface | Source of truth | Repo |
|---|---|---|
| iOS App Store + iPhone home screen | `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (all 18 sizes + `Contents.json`) | **chravel-mobile** |
| Google Play + Android launcher | `android/app/src/main/res/mipmap-*/ic_launcher*.png` + `mipmap-anydpi-v26/ic_launcher.xml` (adaptive: foreground + background) | **chravel-mobile** |
| iOS "Add to Home Screen" (Safari PWA) | `<link rel="apple-touch-icon">` → `public/apple-touch-icon.png` | chravel-web (this repo) |
| Android Chrome PWA install | `public/manifest.json` → `icon-192`, `icon-512`, `icon-maskable-*` | chravel-web (this repo) |
| Browser tab favicon | `public/favicon.ico`, `icon-16.png`, `icon-32.png` | chravel-web (this repo) |

## Plan

### Part A — Fix the web/PWA icons in this repo (what I can do here)

1. You upload the **gold C with airplane indentation** master at 1024×1024 PNG (transparent background preferred). I'll save it as `public/chravel-pwa-icon.png` (canonical source).
2. Regenerate from that master and overwrite in `public/`:
   - `favicon.ico` (multi-res 16/32/48)
   - `icon-16.png`, `icon-32.png`, `icon-192.png`, `icon-512.png`
   - `icon-maskable-192.png`, `icon-maskable-512.png` (with safe-area padding so Android's circular/squircle mask doesn't clip the airplane notch)
   - `apple-touch-icon.png` (180×180, flattened on near-black `#0A0A0A` — iOS does not honor transparency)
3. Bump the asset query string on icon `<link>` tags in `index.html` (e.g. `?v=2026-06-26`) to defeat the iOS Safari home-screen icon cache.
4. Verify `public/manifest.json` references match and include a `purpose: "maskable"` entry.

### Part B — Exact handoff for chravel-mobile (what you/Claude must run in the other repo)

I can't touch the native repo from here. In `chravel-mobile`, run:

```bash
# 1. Drop the same 1024×1024 master at:
#    chravel-mobile/assets/icon-source-1024.png
# 2. Regenerate native icons:
cd chravel-mobile
./appstore/scripts/generate-icons.sh assets/icon-source-1024.png
#    → writes ios/App/App/Assets.xcassets/AppIcon.appiconset/*

# 3. Android adaptive icon — replace:
#    android/app/src/main/res/mipmap-*/ic_launcher.png
#    android/app/src/main/res/mipmap-*/ic_launcher_round.png
#    android/app/src/main/res/mipmap-*/ic_launcher_foreground.png   (gold C only, transparent)
#    android/app/src/main/res/values/ic_launcher_background.xml      (#0A0A0A)
#    Easiest: open Android Studio → right-click res → New → Image Asset → Launcher Icons (Adaptive).

# 4. Sync + rebuild:
npx cap sync ios
npx cap sync android
# Then bump CFBundleVersion (iOS) and versionCode (Android), archive, and upload a NEW build.
```

**The App Store and Play Store will only show the new icon after a brand-new build is uploaded and approved** — re-using the same build number won't refresh it. TestFlight users must delete the old app and reinstall to escape the iOS icon cache.

### Technical notes (non-blocking)

- iOS rejects transparent app icons — the generator must flatten onto an opaque background. Use near-black `#0A0A0A` to match the brand.
- Android maskable icons need ~20% safe-area padding around the C; otherwise the airplane notch gets cropped on Pixel/Samsung launchers.
- The `apple-touch-icon` query-string cache-bust only affects browser PWAs, not the installed native iOS app.

### What I need from you to proceed

1. The **1024×1024 gold-C-with-airplane PNG** (drop it into chat). Transparent background is best; if it's already on dark, I'll flatten as-is.
2. Confirm you want me to do **Part A here** and you'll hand Part B to the chravel-mobile repo (or paste the handoff to Claude there).