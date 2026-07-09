# Notifications Toggle QA Matrix

Manual verification checklist for the 6 notification categories. Run per release
that touches `create_notification_for_trip_members()`, `should_send_notification()`,
`useNotificationPreferences`, or the fanout triggers in
`20260709155343_*_notify_on_activity_fanout.sql`.

For each row: perform the action, then verify Alerts (bell) + inline chat.

| Category            | Source action                                     | Pref key              | Alerts row when ON | Alerts row when OFF | Inline chat post (always) |
| ------------------- | ------------------------------------------------- | --------------------- | ------------------ | ------------------- | ------------------------- |
| Messages            | Another member sends a chat message               | `messages`            | ✅                  | ❌                   | n/a (chat itself)         |
| Broadcasts & Pins   | Another member posts a broadcast                  | `broadcasts_and_pins` | ✅                  | ❌                   | ✅                         |
| Tasks               | Another member creates a task                     | `tasks`               | ✅                  | ❌                   | ✅                         |
| Payments            | Another member records a payment                  | `payments`            | ✅                  | ❌                   | ✅                         |
| Calendar events     | Another member adds a manual calendar event       | `calendar_events`     | ✅                  | ❌                   | ✅                         |
| Polls               | Another member creates a poll                     | `polls`               | ✅                  | ❌                   | ✅                         |
| Basecamp updates    | Trip organizer changes the trip basecamp address  | `basecamp_updates`    | ✅                  | ❌                   | ✅                         |

## Deep-link acceptance

Tap each Alerts row and confirm:

- Chat message → opens the trip's chat tab and jumps to the message.
- Broadcast → opens the trip's broadcasts tab.
- Task → opens the trip's tasks tab with the task focused.
- Payment → opens the trip's payments tab with the payment focused.
- Calendar event → opens the trip's calendar tab on the event's date.
- Poll → opens the trip's polls tab with the poll focused.
- Basecamp update → opens the trip's places tab.

## Dedupe acceptance

Trigger the same action twice within a minute (React StrictMode remount, retry,
duplicate `onSuccess`) and confirm the inline chat system message posts **exactly
once**. Backed by `systemMessageService.isDuplicateDedupeKey`.

## Bulk-import carve-out

Run a Gmail Smart Import that inserts multiple `trip_events` rows with
`source_type in ('gmail_import','bulk_import','import')` — confirm no per-event
Alerts spam (only the import summary triggers a notification, if enabled).
