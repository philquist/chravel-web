# Chravel App Icon Reference

## Canonical Source

**`public/chravel-pwa-icon.png`** is the official Chravel app icon.

- White circular background
- Colorful travel mini-icons around edges (chat, calendar, camera, document, AI, location, dollar)
- Globe/map motif in center
- 1024x1024 PNG, ~1.2 MB

This icon is used for:
- PWA manifest icons (192x192, 512x512)
- iOS home screen (apple-touch-icon)
- Browser favicon
- iOS app icon generation (via `appstore/scripts/generate-icons.sh`)
- Android adaptive icon (foreground)

## File Inventory

| File | Purpose | Notes |
|------|---------|-------|
| `public/chravel-pwa-icon.png` | **Canonical app icon** | Use this for all app icon needs |
| `public/chravel-icon.png` | Marketing splash | Dark bg, gold globe, "ChravelApp" wordmark. NOT an app icon |
| `public/chravel-logo.png` | Marketing splash (duplicate) | Same as chravel-icon.png |
| `public/favicon.ico` | Legacy browser favicon | 73x74 ICO |

## Where Icons Are Referenced

### Web/PWA (chravel-web)

- `index.html` line 5: favicon
- `index.html` lines 34-36: apple-touch-icon (152px, 180px)
- `public/manifest.json` lines 15-26: PWA icons (192x192, 512x512)

### iOS Icon Generation

- `appstore/scripts/generate-icons.sh` generates all required iOS sizes from the canonical source
- Run: `./appstore/scripts/generate-icons.sh`
- Output: `appstore/icons/` + copies to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### Mobile (chravel-mobile)

The chravel-mobile repo should reference this same canonical icon for native builds. See that repo's documentation for specific paths.

## Regenerating iOS Icons

```bash
cd chravel-web
./appstore/scripts/generate-icons.sh
```

This generates all 18 iOS icon sizes from the canonical 1024x1024 source.

## Preventing Regressions

1. **Never use chravel-logo.png as an app icon** - it's a marketing splash with text
2. **Always use chravel-pwa-icon.png** for any launcher/home screen icon
3. **Test icon changes** by installing PWA on iOS/Android home screen
4. After regenerating icons, rebuild and redeploy native apps
