## Goal
Eliminate the popup Thread modal in trip chat. Replies render inline, indented directly under the parent message (iMessage-style), and the existing chat composer is used to reply.

## UX behavior
- Each parent message that has replies shows them stacked beneath it, indented (~32–40px), using the same `MessageBubble` styling at slightly reduced scale.
- The "1 reply / N replies" counter under a message becomes a quiet caption above the nested stack (no longer a button that opens a modal).
- "Reply in thread" action sets the parent as the active reply target. The main chat composer shows an inline pill ("Replying to {name}: {snippet}" with ✕ to clear), and the next sent message is persisted with `reply_to_id`/`thread_id` of the parent so it nests under it.
- New replies arriving via realtime auto-append to the correct nested group and trigger a subtle highlight on the parent.
- Long threads collapse after 3 replies with a "Show N more replies" toggle (inline, no modal).

## Scope of changes (frontend only)

1. `src/features/chat/components/TripChat.tsx`
   - Remove `activeThreadMessage` state, the modal JSX block (lines ~1222–1233), and `ThreadView` import.
   - Group messages: build a `repliesByParentId` map from the existing `messages` array (parents identified via `thread_id` / `reply_to_id`). Render only top-level messages in the main list; pass their `replies[]` to `MessageItem`/`MessageBubble`.
   - Keep `setActiveReply`/composer reply-target wiring; route `onOpenThread` and `onReply` from `MessageActions` to the same "set reply target = parent" handler.
   - Keep `threadReplySuccess` toast logic but change CTA from "View thread" to "Jump to reply" (scrolls to the new reply inline).

2. `src/features/chat/components/MessageItem.tsx` / `MessageBubble.tsx`
   - Accept optional `replies?: Message[]` and `depth?: number` props.
   - When `replies` is non-empty, render a `<div className="ml-8 md:ml-10 mt-1 space-y-1 border-l border-white/10 pl-3">` containing each reply as a nested `MessageBubble` (depth+1, no further nesting allowed — flatten grandchildren into the same group to keep iMessage-style single-level indent).
   - Replace the existing "1 reply" button with a static count caption shown above the nested stack; if `replies.length > 3`, render a "Show N more" inline toggle (local state).

3. `src/features/chat/components/MessageActions.tsx`
   - Collapse the "Reply in thread" + "View thread" pair into a single "Reply" action that calls `onReply(parentId)` (which sets the inline reply target). Update the two affected tests (`MessageActions.threadLabels.test.tsx`, `MessageActions.threadActions.test.tsx`) to assert the new single action.

4. `src/features/chat/components/ThreadView.tsx`
   - Delete file. Delete `__tests__/ThreadView.test.tsx` and `__tests__/ChatSearchOverlay.threadJump.test.tsx` (or update the latter to assert it scrolls to the inline reply instead of opening a modal — preferred).
   - Remove `ThreadView` references from `ChatSearchOverlay.tsx` jump logic; replace with `scrollIntoView` on the message DOM node.

5. `src/features/chat/utils/threadReplySuccess.ts`
   - Repurpose `handleThreadReplySuccessCta` to scroll-to-message instead of `onViewThread`. Update its unit test.

## Data model
No DB or edge-function changes. Existing `trip_chat_messages.reply_to_id` / `thread_id` columns already drive grouping. Realtime subscription unchanged.

## Edge cases
- Reply whose `reply_to_id` parent is not in the loaded window → render as a top-level message with a small "↪ replying to earlier message" caption (no modal).
- Deleted parent with surviving replies → show greyed "Original message deleted" stub; replies still nest under it.
- Broadcasts and system messages cannot be replied to (existing rule preserved).
- Pinned messages: pinning still applies to the parent only.

## Out of scope (explicit, no deferral debt)
- No changes to backend schema, RLS, or realtime triggers.
- No changes to mobile bottom-sheet chat input.
- E2EE handling unchanged — replies inherit parent's encryption mode.

## Verification
- `npm run lint && npm run typecheck && npm run build`
- Updated/affected tests: `MessageActions.threadLabels`, `MessageActions.threadActions`, `TripChat.threadReplyAffordance`, `TripChat.renderPath`, `ChatSearchOverlay.threadJump`, `threadReplySuccess`.
- Manual: send a message → reply via action → reply appears nested under parent (no modal) → realtime second reply appends → "Show more" appears at 4+ replies → ChatSearchOverlay jump scrolls to the nested reply.

## Rollback
Single-feature change in `src/features/chat/components/`. Revert the commit.