# Unify Concierge Confirm-Card Flow for Links, Tasks, Polls

## Goal
Every create/update concierge tool should follow the same pattern: insert into `trip_pending_actions` (audit trail + UI contract), fast-path write the real row, then mark the pending action `confirmed`. This gives the chat a consistent success card with a `pendingActionId`, action type, and promoted/pending booleans.

Today only `createTask` and `createPoll` follow that pattern. `saveLink`, `updateTask`, and `closePoll` write directly with no pending buffer, so the chat shows a plain text response instead of the action card.

## Scope (in this branch)
1. `saveLink` (functionExecutor.ts ~L1047): wrap with pending-buffer + promote pattern.
2. `updateTask` (functionExecutor.ts ~L1751): wrap with pending-buffer + promote pattern.
3. `closePoll` (functionExecutor.ts ~L3820): wrap with pending-buffer + promote pattern.
4. Client invalidation map (`src/lib/conciergeInvalidation.ts`): already covers `saveLink`; verify `updateTask` and `closePoll` invalidation entries remain correct (they do).
5. Confirm-card renderer (`ConciergeActionCardGroup` / `ConciergeActionCard`): no UI change required — these already render any action with `actionType` + `success`. Verify the new `actionType` strings (`save_link`, `update_task`, `close_poll`) are styled; add minimal label/icon mappings if missing.

Out of scope: `deleteTask`, settle/add expense, calendar updates — explicitly deferred (separate follow-up).

## Technical Details

### Shared executor pattern (template)
```ts
const dedupeId = tool_call_id || idempotency_key || null;

const { data: pending, error: pendingError } = await supabase
  .from('trip_pending_actions')
  .insert({
    trip_id: tripId,
    user_id: userId || '00000000-0000-0000-0000-000000000000',
    tool_name: '<tool>',
    ...(dedupeId ? { tool_call_id: dedupeId } : {}),
    payload: { /* canonical args */ },
    source_type: 'ai_concierge',
  })
  .select('id')
  .single();
if (pendingError) throw pendingError;

// fast-path real write
let promoted = false;
const { data: row, error: writeErr } = await supabase.from('<table>')...;
if (!writeErr) {
  promoted = true;
  await supabase
    .from('trip_pending_actions')
    .update({ status: 'confirmed', resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('id', pending.id)
    .eq('status', 'pending');
}

return {
  success: true,
  pending: !promoted,
  promoted,
  pendingActionId: pending.id,
  actionType: '<save_link|update_task|close_poll>',
  message: promoted ? '<success>' : '<awaiting confirm>',
  ...entityPayload,
};
```

### Per-tool specifics
- **saveLink**: keep existing idempotency short-circuit (`deduped: true`) — if existing row found, skip pending insert and return as today (no extra audit row for true dupes). Otherwise follow template. Add `idempotency_key` + `tool_call_id` params to registry schema.
- **updateTask**: pending payload = `{ task_id, ...updatePayload }`. Fast-path = the existing `update().eq('id', taskId)` block. Return `task` row on success. Keep the "task not found in trip" guard before inserting the pending row so we don't pollute the audit log on bad input.
- **closePoll**: pending payload = `{ poll_id }`. Same guard-then-buffer order. Return `poll` row on success.

### Registry (`toolRegistry.ts`)
- Add `idempotency_key` / `tool_call_id` to `saveLink` param schema if absent (mirror createTask).
- No new tools, no schema removals.

### Client (`conciergeInvalidation.ts`)
- Already invalidates `tripTasks` for `updateTask`, `tripPolls` for `closePoll`, `tripPlaces` + `tripLinks` for `saveLink`. No edits required, but re-confirm during implementation.

### Confirm card (`ConciergeActionCard*`)
- Verify label/icon mapping covers `save_link`, `update_task`, `close_poll`. Add minimal entries if missing (label + tab navigation target: Places for save_link, Tasks for update_task, Polls for close_poll).

## Validation
- `npm run typecheck && npm run lint && npm run build`
- Targeted unit/integration: existing tests under `supabase/functions/_shared/__tests__` if any cover createTask buffer — extend for the three new cases (insert pending → fast-path → promoted=true; failed write → promoted=false).
- Manual smoke in preview: ask concierge to "save this link: https://example.com/article", "mark task X done", "close the dinner poll" — confirm action card renders with success state and the relevant tab refreshes.

## Risks
- LOW: pattern is already proven for createTask/createPoll; we're replicating, not inventing.
- Medium-edge: `updateTask` previously returned even when no rows updated; preserve the "No fields to update" early return *before* the pending insert.
- RLS: `trip_pending_actions` insert already permitted for concierge writes — no policy change needed.

## Rollback
Single-file revert of `supabase/functions/_shared/functionExecutor.ts` (and registry if param added). No DB migration, no client contract changes beyond additive action-card mappings.
