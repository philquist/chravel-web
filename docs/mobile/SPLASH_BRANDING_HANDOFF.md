# Splash Branding Handoff (chravel-web)

## What this repo can fix

This repo controls **web/PWA install branding** only:
- `public/manifest.json` (PWA icons)
- `index.html` (`favicon`, `apple-touch-icon`, manifest link)
- static assets under `public/`

This repo does **not** control native Android/iOS launch splash resources (the blue airplane splash). That lives in `chravel-mobile` native resource folders.

## Capacitor setup status in this repo

As of 2026-05-10:
- `capacitor.config.ts`: **missing**
- `@capacitor/*` dependencies in `package.json`: **missing**

Conclusion: this repo is currently web/PWA-focused and does not contain the native splash pipeline.

## Step-by-step prompt to use in `Chravel-Inc/chravel-web`

Use this prompt in Codex **inside the `chravel-web` repo**:

```md
Task: Normalize Chravel PWA/home-screen branding in chravel-web only.

Scope:
- Only modify web/PWA branding assets and references.
- Do NOT touch auth, API, Supabase, business logic, or demo-mode data.
- Do NOT assume native Android/iOS splash can be changed here.

Approved brand intent:
1) App/home-screen icon should remain the white-background globe/calendar/camera/location composition.
2) Native splash-style "blue airplane C" branding must not be referenced by PWA launch assets.
3) Keep one source-of-truth for PWA icon assets in `public/brand/` and route all references through it.

Required changes:
1. Create `public/brand/` and place canonical files:
   - `icon-192.png`
   - `icon-512.png`
   - `icon-maskable-512.png`
   - `apple-touch-icon.png`
   - `favicon-32.png`
2. Update `public/manifest.json`:
   - `icons` should reference only files from `public/brand/`
   - include at least one `purpose: "maskable"` icon
3. Update `index.html`:
   - `rel="icon"` -> `/brand/favicon-32.png`
   - all `apple-touch-icon` links -> `/brand/apple-touch-icon.png`
4. Remove stale PWA icon references to `/chravel-pwa-icon.png` unless intentionally kept as fallback and documented.
5. Add a short doc section `docs/mobile/SPLASH_BRANDING_HANDOFF.md` update with:
   - file map
   - cache-busting/reinstall validation steps
   - why native splash still belongs to chravel-mobile

Validation:
- Run `npm run typecheck`
- Run `npm run build`
- Confirm `rg "chravel-pwa-icon|blue|airplane|favicon|apple-touch-icon" public index.html` results are expected.

Deliverables:
- before/after asset map
- exact files changed
- manual PWA reinstall steps (remove old shortcut, clear site data, reinstall)
```

## Commands to check Capacitor setup quickly

```bash
# from repo root
[ -f capacitor.config.ts ] && echo "capacitor config found" || echo "capacitor config missing"
node -e "const p=require('./package.json');const d={...(p.dependencies||{}),...(p.devDependencies||{})};console.log(Object.keys(d).filter(k=>k.startsWith('@capacitor/')).sort())"
```

## Native repo prompt (use in chravel-mobile)

Use this concise prompt in `Chravel-Inc/chravel-mobile`:

```md
Task: Replace legacy blue airplane splash branding with approved gold globe + tagline splash on Android + iOS native launch.

Update all active native splash/icon references:
- Android: `res/drawable*`, `res/mipmap*`, `values/styles.xml`, `values-v31/styles.xml`, manifest theme
- iOS: `Assets.xcassets`, `LaunchScreen.storyboard`
- Expo/Capacitor config used for asset generation

Preserve:
- launcher icon remains approved white-background globe icon
- splash uses approved gold globe + "Less chaos, more coordination"

Validate on clean install (not upgrade), Android 12+, iOS simulator/device, and confirm no blue splash flash.
```
