## Goal
Close the remaining notification gaps so users can (a) see unread counts on Alerts + inline chat activity, (b) never see the same task-created system message twice, (c) tap an alert and land on the exact trip/tab/message, and (d) trust that every settings toggle actually gates delivery.

## 1. Deduplicate task system messages
**Problem:** `useTripTasks.createTask` calls `systemMessageService.taskCreated`, AND the DB `notify_on_task_assignment` trigger fanout also currently posts a "task assigned to X" activity via `systemMessageService`. When a user creates a task with themselves (or anyone) assigned, both fire → two inline messages.

**Fix:** Make `taskCreated` the single source of truth for the "task was created" inline message. In `useTripTasks.createTask`:
- If assignees are provided at creation, call `systemMessageService.taskCreated` with an assignee suffix (e.g., "Nick created a task 'Pack bags' · assigned to Ana") and set a dedupe key `task_created:<taskId>`.
- Skip a separate `taskAssigned` inline post for the initial assignment batch (only post `taskAssigned` for later re-assignments in `assignTask`).
- Add `dedupeKey` support in `systemMessageService` so repeat sends for the same key are dropped (in-memory Set + optimistic short-circuit).

Audit other paths (`useTripPolls`, `useCalendarManagement`, `usePayments`, `basecampService`) for the same double-post risk and add dedupe keys.

## 2. Unread indicators
Two surfaces need badges:

**Alerts bell (global):**
- Already backed by `notificationRealtimeStore.unreadCount`. Verify the bell icon in the top header reads it and shows a red dot + count. If missing, wire it in the header/notifications-dialog trigger.

**Inline chat system activity (per-trip):**
- Add a lightweight `useTripSystemActivityUnread(tripId)` hook that counts system messages newer than the user's `last_read_at` for the trip's chat channel (already tracked in Stream read state).
- Surface a small pill on the Chat tab label and on the trip card ("3 new updates") when > 0. Consumes `splitUnreadFromStreamReadState` output — system messages are the "message_type === 'system'" bucket.

## 3. Deep links on Alerts items
Every notification row already carries `metadata` (trip_id, tab, message_id, channel_type). `resolveNotificationNavigation` returns `{ tab, shouldHandshakeChat }`.

**Fix:** In the Alerts list item click handler (find in `NotificationsDialog.tsx` / consumer + enterprise notification sections):
1. Parse metadata via `parseNotificationMetadata`.
2. Resolve tab via `resolveNotificationNavigation`.
3. Navigate to `/trip/:tripId?tab=<tab>&focus=<message_id|event_id|poll_id|task_id>`.
4. Mark the row read on click (optimistic).
5. In the target tab, read `?focus=` from the URL and scroll/highlight the matching row. For chat, use Stream's `jumpToMessage(messageId)`.

Backfill missing metadata on the four new triggers from migration `20260709155343_*.sql` so poll/task/calendar/basecamp notifications include `tab`, `message_id` (or entity id), and `entity_type` — currently they only pass generic fields.

## 4. Verify every settings toggle end-to-end
Write a Vitest integration spec `src/__tests__/notificationPreferences.integration.test.ts` that, for each of the 6 categories (messages, broadcasts_and_pins, tasks, payments, calendar_events, polls):
1. Toggles the pref OFF via `useNotificationPreferences`.
2. Simulates the source event (mock insert via `supabase.from(...).insert`).
3. Asserts NO row lands in `notifications` for the user (pref gate held).
4. Toggles ON, repeats, asserts a row DOES appear with correct `metadata.tab` and `metadata` deep-link fields.
5. Asserts inline chat system message posts regardless of the pref (chat activity is UI-only, not gated by push prefs).

Also add a small manual QA checklist under `docs/qa/notifications-toggle-matrix.md` for reviewer sign-off.

## Files touched
- `src/services/systemMessageService.ts` — dedupe key support
- `src/hooks/useTripTasks.ts` — merge assignees into `taskCreated`, drop redundant `taskAssigned` on initial create
- `src/hooks/useTripPolls.ts`, `src/hooks/usePayments.ts`, `src/features/calendar/hooks/useCalendarManagement.ts`, `src/services/basecampService.ts` — add dedupe keys
- `src/hooks/useTripSystemActivityUnread.ts` (new)
- Chat tab label component + trip card — render new unread pill
- `src/components/home/NotificationsDialog.tsx` + consumer/enterprise notification sections — click handler → deep-link nav + mark-read
- Trip detail route — read `?focus=` and scroll/jump target
- New migration `2026xxxx_notification_metadata_deeplink.sql` — extend the 4 fanout functions from `20260709155343_*.sql` to write `metadata.tab`, `metadata.entity_id`, `metadata.entity_type`, and (for basecamp) `metadata.channel_type`
- `src/__tests__/notificationPreferences.integration.test.ts` (new)
- `docs/qa/notifications-toggle-matrix.md` (new)

## Out of scope
- Push/VAPID delivery changes
- New notification categories
- Redesign of the Alerts panel visuals
- Per-trip mute overrides (already covered by `TripActivitySettings`)

## Risk
LOW-MEDIUM. The dedupe change touches task creation — will add a regression test. The deep-link migration re-creates existing trigger functions (safe via `CREATE OR REPLACE`).
