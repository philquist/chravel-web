# Platform Capability Matrix (Web / PWA / iOS Wrapper)

_Last updated: 2026-05-24_

## Critical Flow Matrix

| Critical Flow | Web (Browser Tab) | PWA (Standalone) | iOS Wrapper (Capacitor/WebView) | Notes / Fallback |
|---|---|---|---|---|
| Auth sign-in + session restore | ✅ Supported | ✅ Supported | ✅ Supported | OAuth uses `returnTo`; installed contexts use in-app browser callback. |
| Deep-link routing (`/join/:code`, `/trip/:id`, `/t/:id`) | ✅ Supported | ✅ Supported | ✅ Supported | Pending destination capture now preserves query/hash for resume-safe restore. |
| Offline read surfaces (tasks/polls/cached trip data) | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | Read paths available where hooks use IndexedDB cache; writes are queued per-hook support. |
| Offline mutation queue + replay | ✅ (module-dependent) | ✅ (module-dependent) | ✅ (module-dependent) | Tasks/Polls queue on offline; not every module is queue-backed yet. |
| Notification registration | ✅ Web Push where supported | ✅ iOS 16.4+ Home Screen only | ✅ Native push bridge path | Browser/device permission gates differ per platform. |
| Notification tap navigation | ✅ Supported | ✅ Supported | ✅ Supported | Metadata-first route mapping in notifications dialog and realtime store. |
| App resume auth freshness | ✅ Supported | ✅ Supported | ✅ Supported | Visibility refresh path retries session refresh near expiry/loss. |
| Service worker updates | ✅ Supported | ✅ Supported | N/A | Native wrapper handles lifecycle; SW update toast for web/PWA only. |

## Verification Targets

- Install + launch: web/PWA/iOS wrapper can reach authenticated home.
- Deep link: `/join/:code`, `/trip/:id?tab=chat`, `/t/:id` survive auth and onboarding.
- Resume: background 5+ min then foreground restores session and route.
- Offline: module surfaces show deterministic loading/empty/error/retry and no dead-end.
- Push: token registration refresh + notification tap routes to intended trip/tab.
