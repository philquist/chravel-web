# Native Push + App-Icon Badge Checklist (chravel-mobile Expo repo)

The web/PWA + server side of push badges is wired in `chravel-web`. The numeric
**app-icon badge** on iOS (TestFlight) is driven entirely by the APNs payload the
server now sends — but a few things must be true in the separate **chravel-mobile
Expo** app for it to light up. This file is the hand-off checklist; none of it is
implementable from `chravel-web`.

## What the server now sends

`dispatch-notification-deliveries` (the canonical delivery path) computes a
per-recipient, category-filtered unread count and injects it into both transports:

- **iOS via FCM V1:** `message.apns.payload.aps.badge = <count>` (title/body still
  come from the top-level `notification`).
- **Web push (PWA):** `data.badgeCount = <count>` (the service worker calls
  `navigator.setAppBadge`).

The badge counts ONLY: new broadcasts, basecamp updates, trip acceptances
("you were accepted on a trip you requested"), and chat messages **when the user
enabled the `chat_messages` preference**. It excludes polls/tasks/calendar/payments.
Source of truth: `supabase/functions/_shared/badgeCategories.ts`.

## Native checklist

1. **Register the device token.** On launch + after permission grant, obtain the
   device push token and upsert it into `push_device_tokens` with:
   - `user_id` = signed-in user
   - `platform = 'ios'`
   - `disabled_at = null`

   This is exactly the row shape `dispatch-notification-deliveries` reads
   (`.eq('platform' …)` is not used; it filters `disabled_at IS NULL`). If the
   token never lands here, the server has nothing to send to.

2. **Confirm the transport is FCM.** The server sends iOS through **FCM V1** with
   an `apns` override block. The native app must therefore register an **FCM**
   token (e.g. via `@react-native-firebase/messaging` or the Expo push token that
   maps to FCM), not a bare APNs device token. If the build instead uses a direct
   APNs token, the badge field location differs (top-level `aps.badge` vs the FCM
   `apns.payload.aps.badge`) and the `send-push` function — not `dispatch` — would
   be the path to wire. Document which transport this build targets.

3. **Honor `aps.badge` on receipt.** iOS applies `aps.badge` automatically. Do NOT
   override or zero the badge when a notification arrives in the background. No
   client code is needed to *set* the badge.

4. **Reset the badge on foreground.** On `AppState` → `active`, clear it so the
   badge matches an opened app (mirrors the web `visibilitychange` clear in
   `useAppBadge`):
   ```ts
   import * as Notifications from 'expo-notifications';
   await Notifications.setBadgeCountAsync(0);
   await Notifications.dismissAllNotificationsAsync();
   ```

5. **Keep the push preference in sync.** When the native app registers or
   unregisters for push, also update `notification_preferences.push_enabled` for
   the user so the web settings toggle reflects the device state.

## Verifying on TestFlight

1. Sign in on a TestFlight build; confirm a row appears in `push_device_tokens`
   with `platform = 'ios'`.
2. With the app backgrounded, trigger a badge-countable notification (post a
   broadcast, change basecamp, or approve the user's join request via
   `approve_join_request`), then run `dispatch-notification-deliveries`.
3. The badge should appear on the app icon with the correct count. Send a second
   one → count increments.
4. Open the app → badge clears (step 4 above).
5. Send a non-badge notification (poll/task/payment) → the badge does NOT change.
