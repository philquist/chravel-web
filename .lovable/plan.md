## Context

In the previous turn we already migrated `createTask`, `updateTask`, `createPoll`, and `closePoll` to the buffered "pending → real write → confirmed" flow, and added `create_task`, `update_task`, `create_poll`, `close_poll` (+ `save_link`) to `ConciergeActionCard`'s `ACTION_CONFIG`. Verified:

- `supabase/functions/_shared/functionExecutor.ts` — buffered writes at lines 193 (createTask), 278 (createPoll), 1835 (updateTask), 3933 (closePoll).
- `src/features/chat/components/ConciergeActionCard.tsx` — config entries at lines 42, 48, 72, 78, 84.
- `src/lib/conciergeInvalidation.ts` — `tripTasks` / `tripPolls` invalidation already wired.
- `src/__tests__/conciergePendingActionCoverage.test.ts` — guards that every buffered tool has a `usePendingActions` case.

So create/update for tasks and polls already share the same confirm-card pipeline as `createTask` / `saveLink`. The gap is the remaining task/poll mutations that still write directly (no pending row → no confirm card → inconsistent UI feedback):

- `deleteTask` (toolRegistry line 633)
- `splitTaskAssignments` (line 1163)
- `bulkMarkTasksDone` (line 1253)

These are user-visible task mutations triggered through the same Concierge surface, so leaving them on the direct-write path is the actual remaining "consistent success UI feedback" gap.

## Goal

Bring `deleteTask`, `splitTaskAssignments`, and `bulkMarkTasksDone` onto the same buffered confirm-card flow used by `createTask` / `updateTask` / `createPoll` / `closePoll`, so every task/poll tool renders a uniform success card.

## Changes

### 1. `supabase/functions/_shared/functionExecutor.ts`
For each of the three tools, refactor to the standard pattern already used by `updateTask`:

1. Validate inputs and that the target record(s) exist and belong to `trip_id` **before** any writes.
2. Idempotency short-circuit on `tool_call_id` / `idempotency_key` against `trip_pending_actions` (10-minute window for `splitTaskAssignments` and `bulkMarkTasksDone`; `deleteTask` keyed on `task_id`).
3. Insert `trip_pending_actions` row with `status: 'pending'`, `tool_name`, sanitized `payload`.
4. Perform the real DB mutation (fast-path) — `trip_tasks` delete, assignment upsert/replace, or bulk status update.
5. On success, mark the pending row `status: 'confirmed'` with `resolved_at`.
6. Return `{ success, pending: true, promoted: true, pendingActionId, actionType, message }` — same shape as `updateTask`.
7. On failure after the pending row is written, mark it `status: 'failed'` and surface the error.

### 2. `src/features/chat/components/ConciergeActionCard.tsx`
Add `ACTION_CONFIG` entries (icon + color, matching the existing task entries):

- `delete_task` → `Trash2`, destructive red theme
- `split_task_assignments` → `Users`, task-blue theme
- `bulk_mark_tasks_done` → `CheckCheck`, task-green theme

No layout changes; piggyback on the existing card renderer.

### 3. `src/hooks/usePendingActions.ts`
Add `case` branches for `deleteTask`, `splitTaskAssignments`, `bulkMarkTasksDone` in the confirm switch so the coverage test (`conciergePendingActionCoverage.test.ts`) passes. Each case re-runs the same DB mutation as the executor's fast path (idempotent against `pending_action_id`).

### 4. `src/lib/conciergeInvalidation.ts`
Already maps all three tools to `['tripTasks', tripId]` — no change.

### 5. Tests
- `src/__tests__/conciergePendingActionCoverage.test.ts` — passes automatically once the `usePendingActions` cases land.
- Add lightweight unit coverage in `src/features/chat/components/__tests__/PendingActionCard.test.tsx` for one new tool (`deleteTask`) to confirm confirm/retry rendering.

## Validation

- `npm run lint && npm run typecheck && npm run build`
- `npm run test:run` — focused on `conciergePendingActionCoverage` and `PendingActionCard`.
- Manual: in Concierge, run "delete the welcome dinner task", "split the airport pickup task between Alex and Sam", and "mark all packing tasks done" — confirm a confirm card appears with the same styling family as `createTask`, task list invalidates, and a duplicate call within 10 min is short-circuited.

## Risk

LOW–MEDIUM. Edge-function-only refactor of three tools onto an already-proven pattern (the exact flow `updateTask` uses). No schema changes, no RLS changes, no client routing changes. Rollback = revert the executor cases; client `ACTION_CONFIG` additions are inert without server pending rows.

## Out of scope (deferred, paste-ready)

- Migrating non-task/poll direct-write tools (`setBasecamp`, `updateTripDetails`, `generateTripImage`, etc.) to the buffered flow — different domains, separate review.
- Replacing the bespoke `bulkDeleteCalendarEvents` preview flow — already has its own confirm UX.
