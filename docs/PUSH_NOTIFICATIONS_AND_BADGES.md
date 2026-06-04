# Push Notifications & Home-Screen Badges — Architecture & Verification

Push notifications (and the app-icon badge) are the MVP replacement for Twilio SMS:
they reach users when the app is closed. This documents how the system works, what
secrets it needs, and exactly how to verify it on each platform.

---

## Delivery architecture

```
domain action ──► create-notification (edge) ──► notifications row
                                              └─► trigger queue_notification_deliveries
                                                    └─► notification_deliveries (push + email rows)
cron (every 1 min) ──► dispatch-notification-deliveries (edge)
   ├─ push branch ─► FCM V1 (Android + iOS APNS, sets aps.badge)  ◄─ push_device_tokens
   │              └─► Web Push (VAPID)                            ◄─ web_push_subscriptions
   └─ email branch ─► Resend / SendGrid
```

- **Per-type copy** comes from `_shared/notificationContentBuilder.ts` (`buildNotificationContent`)
  for both push and email — e.g. "Payment Request in {trip}", "New Broadcast in {trip}".
- **Quiet hours** are honored in the dispatcher: push/email are deferred (re-queued for
  the window end); the in-app notification still appears immediately.
- **Category toggles** (`broadcasts`, `tasks`, `payments`, `calendar_events`, `polls`,
  `join_requests`, `basecamp_updates`, `chat_messages`) gate delivery via
  `enforcePreferenceAtSendTime` + `should_send_notification`.

## Badge architecture

| Surface | Mechanism | Source of truth |
|---|---|---|
| App open / alive (all platforms) | `useAppBadge` → `navigator.setAppBadge(unreadCount)` | `notificationRealtimeStore.unreadCount` (authoritative; updates on receive/read/read-all) |
| App closed, web/PWA push | `sw.js` push handler → `setAppBadge(payload.data.badgeCount)` | dispatcher's per-recipient unread count |
| App closed, iOS native (TestFlight) | FCM `apns.payload.aps.badge` → APNS sets the icon badge | dispatcher's per-recipient unread count |
| App closed, Android native | FCM `data.badgeCount` delivered | needs a native count-badge plugin (see Limitations) |

The foreground hook reconciles the badge to the true unread count whenever the app is
foregrounded, self-correcting any drift from the background increment.

---

## Required secrets / env (per platform)

| Platform | Where | Keys |
|---|---|---|
| Web Push (PWA) | Frontend (Vercel) | `VITE_VAPID_PUBLIC_KEY` |
| Web Push (PWA) | Supabase edge secrets | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| FCM (Android + iOS via APNS) | Supabase edge secrets | `VERTEX_PROJECT_ID` (+ the FCM service-account used by `getFcmAccessToken`) |
| iOS APNS | Firebase console | APNS auth key uploaded to the Firebase project (so FCM can deliver to APNS) |
| Email | Supabase edge secrets | `RESEND_API_KEY` or `SENDGRID_API_KEY` |

If `VAPID_*` or `VERTEX_PROJECT_ID` are missing, the dispatcher logs and skips that
channel — verify they are set before device testing.

---

## Verification runbook (device testing — required before fully retiring SMS)

### A. Installed PWA (Android Chrome / desktop Chrome / iOS 16.4+ Safari)
1. Open the deployed site, **Add to Home Screen / Install**.
2. Open the installed app → Settings → Notifications → toggle **Push Notifications** ON.
   - Expect a browser permission prompt; allow it. (This now creates a
     `web_push_subscriptions` row — confirm in the DB.)
3. From another account, trigger a notification (post a broadcast, create a payment
   request, assign a task).
4. With the PWA **closed**, expect: a system push notification with the per-type copy,
   and a **count badge on the app icon**.
5. Open the app and read the notification → badge **decrements / clears**.
6. Enable **Quiet Hours** spanning "now" → trigger a notification → expect the in-app
   item immediately but **no push** until the window ends.

### B. iOS native (TestFlight)
1. Install the TestFlight build; allow notifications on first prompt (or Settings →
   Notifications → ON, which calls `registerForPush` → `push_device_tokens`).
2. Trigger a notification from another account with the app **closed**.
3. Expect: APNS push with per-type copy + **count badge on the home-screen icon**
   (driven by `aps.badge`).
4. Open + read → badge clears.

### C. Android native (Play / internal build)
1. Install; allow notifications; confirm a `push_device_tokens` row exists.
2. Trigger a notification with the app closed → expect the push with per-type copy.
3. App-icon **count** badge: see Limitations — by default Android shows a notification
   dot, not a number, unless the native count-badge plugin is added.

### Network/DB checks during testing
- `web_push_subscriptions` / `push_device_tokens` rows exist for the test user.
- `notification_deliveries` rows for the notification move `queued → sent` (push/email).
- No `unsupported_channel` / stuck `processing` rows.

---

## Native app (iOS/Android) badge wiring — belongs in `chravel-mobile`, not here

**`chravel-web` is the web/PWA app only.** It has no Capacitor/native runtime
(`useNativePush` is a web stub: *"Native push is handled by the separate
chravel-mobile Expo app"*; there are no `@capacitor/*` deps, no `capacitor.config`,
and no `ios/`/`android/` projects). A Capacitor badge plugin therefore cannot run
here — the native badge code must live in the native app repo.

The web dispatcher already sends everything the native app needs:
- iOS: APNS `aps.badge` (set in `_shared/fcmV1.ts` → FCM `apns.payload.aps.badge`)
  — iOS sets the home-screen badge automatically, **no app code required**.
- Android: FCM `data.badgeCount` (string) — Android needs the app to set the count
  explicitly in its push-received handler.

Paste ONE of these into the native app, matching its framework:

**Capacitor (`@capawesome/capacitor-badge`):**
```ts
import { Badge } from '@capawesome/capacitor-badge';
import { PushNotifications } from '@capacitor/push-notifications';

PushNotifications.addListener('pushNotificationReceived', async (n) => {
  const count = Number(n.data?.badgeCount);
  if (Number.isFinite(count) && count >= 0) await Badge.set({ count });
});
// Clear when the app is opened / notifications are read:
//   await Badge.clear();
```

**Expo (`expo-notifications`):**
```ts
import * as Notifications from 'expo-notifications';

Notifications.addNotificationReceivedListener((n) => {
  const count = Number(n.request.content.data?.badgeCount);
  if (Number.isFinite(count) && count >= 0) Notifications.setBadgeCountAsync(count);
});
// Clear on app resume / read: Notifications.setBadgeCountAsync(0);
```

iOS (APNS) and the installed PWA already show count badges from `chravel-web`.

## Other limitations / follow-ups
2. **iOS Safari** only supports web push when the site is **installed to the Home Screen**
   (iOS 16.4+). Non-installed Safari tabs get no web push (expected).
3. The native/web push-toggle logic is duplicated across the consumer/enterprise/event
   notification sections; extract a shared `usePushPreferenceToggle` hook.
4. Device verification (A/B/C above) cannot be automated in CI — it is a manual gate.
