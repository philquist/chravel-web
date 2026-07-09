
## Problem

Two disconnects the user reported:

1. **Settings ↔ Alerts panel** — toggles for Polls, Calendar Events, Basecamp Updates, and (non-assignment) Tasks are ON, but no rows land in the `notifications` table for those events, so the Alerts (bell) panel stays empty even when those things happen.
2. **Inline chat activity** — action items like "Sarah created a poll", "Basecamp updated", "Mike added a payment request" don't reliably show up as system messages inside the trip chat, so members miss them unless they open the exact tab.

## Root cause (verified)

- `systemMessageService` already has methods for `pollCreated / pollClosed`, `taskCreated / taskCompleted`, `calendarItemAdded`, `paymentRecorded / paymentSettled`, `tripBaseCampUpdated`, `personalBaseCampUpdated`, `memberJoined/Left`, uploads.
- Callers that exist: tasks (`useTripTasks`), polls (`useTripPolls`), calendar (`useCalendarManagement`), basecamp (`basecampService`), media, member joined. **Payments are NOT calling `paymentRecorded / paymentSettled`** — `paymentService.createPaymentMessage` and `usePayments` never fan out an inline system message.
- DB fanout (`create_notification_for_trip_members`) is only wired for: `broadcast`, `mention`, `task_assignment`, `payment`, `trip_invite`, `member_joined`. **No triggers exist for `poll_created`, `calendar_event_added` (bulk trigger exists for imports only), `task_created` (only assignment), or `basecamp_updated`.** So those preference toggles have nothing feeding them → Alerts stays empty.

## Scope of change

Frontend + one focused SQL migration. No refactors of unrelated systems. Preference gating already lives in `should_send_notification()` — we route new fanouts through `create_notification_for_trip_members()` so gating is automatic.

### 1. Chat inline activity — close the payments gap

- `src/services/paymentService.ts` / `src/hooks/usePayments.ts`: after `createPaymentMessage` returns a `paymentId`, emit `systemMessageService.paymentRecorded(tripId, actorName, paymentId, amount, currency, description)`. Fire-and-forget (`void`), never block the mutation.
- `src/components/payments/PaymentsTab.tsx` settle flow / hook: on successful settle, emit `systemMessageService.paymentSettled(...)`.
- No changes to Stream schema — `systemMessageService` already sends `message_type: 'system'` with `silent: true` and `skip_push: true`, and `SystemMessageBubble` already renders them. Chat push is separately gated by `chat_messages` pref, so this does not create push spam.

### 2. Alerts panel — add DB fanout for the missing categories

New migration `supabase/migrations/<ts>_notify_on_activity_fanout.sql`:

- `notify_on_poll_created()` AFTER INSERT on `trip_polls` (or the canonical polls table) → `create_notification_for_trip_members(trip_id, created_by, 'poll', 'poll', poll_id, 'polls', 'normal', '/trip/<id>?tab=polls', 'New poll', LEFT(question,140), jsonb_build_object('poll_id', id), 'poll:'||id)`.
- `notify_on_task_created()` AFTER INSERT on `trip_tasks` → category `'tasks'`, tab `tasks`. Skips when row also has an assignee (existing assignment trigger already covers that case) to avoid double-notify.
- `notify_on_calendar_event_added()` AFTER INSERT on `trip_calendar_events` → category `'calendar_events'`, tab `calendar`. Suppressed when insert originates from bulk import batch (existing bulk trigger stays authoritative).
- `notify_on_basecamp_updated()` AFTER UPDATE on `trips` WHEN `NEW.basecamp_address IS DISTINCT FROM OLD.basecamp_address` → category `'basecamp_updates'`, tab `places`, title "Basecamp updated".
- All triggers `SECURITY DEFINER`, `search_path = public`, dedupe key includes the row id so retries don't duplicate.
- Each trigger uses `should_send_notification()` implicitly via the shared fanout helper (which the existing gate already respects for `in_app`).

Grants: none (functions only, no new tables).

### 3. Preference contract — no schema change

`notification_preferences` already has `polls`, `tasks`, `calendar_events`, `payments`, `basecamp_updates`, `chat_messages`, `broadcasts`, `join_requests`. `should_send_notification()` (2260708120000 migration) already maps all these labels — verified.

### 4. Verification

- Unit: extend `src/services/__tests__/systemMessageService.stream.test.ts` with `paymentRecorded/paymentSettled` cases.
- Manual: on a real trip, toggle each pref OFF/ON and confirm (a) inline system message appears in chat, (b) row appears in `notifications` and rings the Alerts bell only when the matching pref is ON.
- Regression: broadcasts, mentions, task-assignment, member-joined paths untouched.

## Out of scope

- No changes to push delivery (VAPID/APNs), Delivery Methods UI, or Stream config.
- No changes to per-trip `TripActivitySettings` override contract.
- No changes to the demo-mode mock data path.

## Files touched

```
supabase/migrations/<new>_notify_on_activity_fanout.sql   (new)
src/services/paymentService.ts                            (emit paymentRecorded)
src/hooks/usePayments.ts                                  (emit paymentSettled on settle)
src/components/payments/PaymentsTab.tsx                   (only if settle handler lives here)
src/services/__tests__/systemMessageService.stream.test.ts (payment cases)
```

## Rollback

- Migration: `DROP TRIGGER` + `DROP FUNCTION` for the four new triggers.
- Client: revert the payment emit lines (2–4 lines each). Zero schema coupling.
