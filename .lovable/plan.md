# Concierge Conversation Mode — Polish + Billing Fix

Four scoped changes to `useConciergeConversationMode`, `ConciergeConversationButton`, `AIConciergeChat`, the `lovable-concierge` edge function, and one tiny DB table for session-level usage de-dup.

---

## 1. Cancel / Stop button (immediate kill)

Today the orb toggles, but during `transcribing` / `sending` / `speaking` it just flips `active=false` without aborting in-flight work.

**`useConciergeConversationMode.ts`**
- Add an `AbortController` per turn (`turnAbortRef`). Pass `signal` into the `supabase.functions.invoke('concierge-stt', …)` call.
- Add a `cancel()` function (exposed alongside `toggle`) that:
  1. Sets `active=false`, `state='idle'`, clears `liveTranscript`.
  2. Calls `turnAbortRef.current?.abort()` (kills STT mid-flight).
  3. Calls `streamAbortRef.current?.abort()` from `useConciergeMessages` — wire it in via a new `onCancelStream` option so we can stop the LLM stream too.
  4. `releaseMic()` + `ttsStop()` immediately (mic closes within one frame).
- `toggle()` keeps current start behavior; ending now routes through `cancel()`.

**`ConciergeConversationButton.tsx`**
- When `active`, render a second small square-stop pill next to the orb labeled "Stop" (or replace the orb icon with `Square` from lucide). Always visible during `listening|transcribing|sending|speaking`. Tapping calls `cancel()` — confirmed kill within ~1 frame.

Acceptance: tap Stop mid-stream → no further tokens arrive, mic indicator off, TTS silent, button returns to default within ~200ms.

---

## 2. Live + final transcript display

Today `liveTranscript` is only set once after STT completes.

**Hook**
- Add a `partialTranscript` state. While `state === 'listening'`, surface a lightweight "Listening…" indicator + RMS-driven word-count is out of scope (no streaming STT here — `concierge-stt` is batch). We will instead:
  - Show `"Listening…"` placeholder during capture.
  - Once STT returns, set `liveTranscript` (final) and surface it for ~1.5s before/while `sending` so the user reads what we heard.
  - Keep the final transcript pinned above the orb until the next turn starts (replaces "Hands-free — talk to your concierge…" subline once a turn has completed).
- Expose `lastFinalTranscript: string`.

**Button component**
- Two lines:
  - Top: state label (`Listening…`, `Got it…`, etc.).
  - Bottom: `liveTranscript || lastFinalTranscript || tagline`. Italic, truncated to 2 lines (not 1) on mobile.

Note: true word-by-word streaming requires switching STT to a streaming model — flagged as a follow-up, not done here.

---

## 3. Visible Conversation Mode toggle

Today gating is purely `useFeatureFlag('concierge_conversation_mode')`.

- Add a user preference `concierge_conversation_mode_enabled` persisted in `localStorage` (`ai_concierge_prefs.conversation_mode`), default `true` when the flag allows it.
- New small toggle row in `AIConciergeChat` header (next to Search/Upload) or in the existing `ConciergeConversationButton` block: a `Switch` labeled "Conversation mode" with helper text. Wired through `useAIConciergePreferences` (extend it with `conversationMode: boolean` + setter).
- Effective enabled = `featureFlag && userPref && !isDemoMode`. When user disables: `ConciergeConversationButton` is hidden and `useConciergeConversationMode` receives `enabled=false` (which already auto-stops via existing effect).

Acceptance: user can disable in-app without admin flipping the flag; preference persists across reloads.

---

## 4. One query per **conversation**, not per turn

Today every `handleSendMessage` turn calls `incrementConciergeTripUsage` in `lovable-concierge`.

**Client**
- Generate `conversationSessionId = crypto.randomUUID()` when conversation mode starts; clear on cancel/stop.
- Pass it through `handleSendMessage` → `useConciergeStreaming` → request body as `conversation_session_id`.

**Edge function `lovable-concierge`**
- Before `incrementConciergeTripUsage`, if `conversation_session_id` is present and (`user_id`, `trip_id`, `conversation_session_id`) already exists in a new `concierge_conversation_sessions` table → skip increment. Else insert the row and increment once.
- The trip-limit pre-check (`buildTripLimitReachedResponse`) still runs normally — a user at the cap can't open a new conversation, but mid-conversation turns are free.

**Migration** (`supabase/migrations/<ts>_concierge_conversation_sessions.sql`)
```sql
CREATE TABLE public.concierge_conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id text NOT NULL,
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trip_id, session_id)
);
GRANT SELECT, INSERT ON public.concierge_conversation_sessions TO authenticated;
GRANT ALL  ON public.concierge_conversation_sessions TO service_role;
ALTER TABLE public.concierge_conversation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions"
  ON public.concierge_conversation_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.concierge_conversation_sessions (user_id, trip_id, session_id);
```

Acceptance: open conversation, ask 5 questions, end → `usage.remaining` drops by exactly 1. Text-mode usage unchanged.

---

## Out of scope (flagged for later)
- True word-by-word streaming STT (requires swapping `concierge-stt` for a streaming provider).
- Barge-in (interrupt assistant mid-speech by talking).
- Persisting conversation-session telemetry for analytics.

## Files touched
- `src/features/concierge/hooks/useConciergeConversationMode.ts`
- `src/features/concierge/components/ConciergeConversationButton.tsx`
- `src/components/AIConciergeChat.tsx`
- `src/features/concierge/hooks/useAIConciergePreferences.ts` (extend)
- `src/features/concierge/hooks/useConciergeStreaming.ts` (forward `conversation_session_id`)
- `supabase/functions/lovable-concierge/index.ts` (skip increment on known session)
- `supabase/migrations/<ts>_concierge_conversation_sessions.sql`
