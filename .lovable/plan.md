# Concierge voice fixes + conversation mode

## Part 1 — Fix "Chravel" pronunciation (sounds like "Kravel")

Root cause: OpenAI TTS (and every other TTS engine) reads "Chravel" with a hard "Ch" because it isn't a real word. The fix that works on **every voice** is to normalize the text before it ever reaches TTS — the brand stays spelled "Chravel" everywhere visually, but the audio stream hears "Travel".

**Changes:**

1. `supabase/functions/concierge-voice-tts/index.ts` — before calling the Lovable AI Gateway, run a single replace on the incoming `text`:
   - `Chravel` → `Travel`, `chravel` → `travel`, `Chraveler` → `Traveler`, `Frequent Chraveler` → `Frequent Traveler`.
   - Word-boundary regex so it doesn't touch unrelated substrings.
   - This automatically fixes the preview line, every spoken assistant reply, and the new conversation mode below — no per-voice tuning needed.

2. `src/features/concierge/components/ConciergeVoicePicker.tsx` — leave the on-screen `PREVIEW_TEXT` as "Hi, I'm your Chravel concierge…" (visual brand stays correct); the server-side normalizer handles the audio.

No model/system-prompt changes. No client edits beyond optional reuse of the same helper if we later add browser-side `SpeechSynthesis` fallbacks.

## Part 2 — Conversation mode in the Concierge tab

Today: type or dictate → send → tap ▶ on each reply to hear it. Goal: ChatGPT-style hands-free back-and-forth using the voices already in the picker.

**Recommended approach — "Walkie-talkie loop" built on the Lovable stack we already have.** No new vendors, no realtime websocket infra, works with every Coral/Alloy/Sage/etc. voice, billed as 1 query per user turn (matches what you asked for).

Flow per turn:
```
mic open → VAD detects end-of-speech → concierge-stt (Whisper via Lovable)
        → lovable-concierge (same Gemini pipeline as text chat, 1 query)
        → concierge-voice-tts streaming MP3 → autoplay
        → on playback end, mic auto-reopens → next turn
```

**Changes:**

1. New hook `src/features/concierge/hooks/useConciergeConversationMode.ts`
   - Wraps existing `useConciergeVoiceInput` (mic + STT) and `useConciergeVoice` (TTS).
   - Adds a simple state machine: `idle → listening → thinking → speaking → listening`.
   - Silence detection (~1.2s of no audio above threshold) ends the user turn.
   - Barge-in: tapping the mic or starting to speak stops current TTS playback.
   - Exits cleanly on tab change / unmount / network error.

2. New component `src/features/concierge/components/ConciergeConversationButton.tsx`
   - Big circular mic/orb button in the Concierge composer (next to send).
   - Pulses gold while listening, slow-pulse while the assistant is speaking, matches the existing Luxury Dark token palette.
   - Tap to start, tap again to end. Shows live transcript above as it streams in.

3. `src/components/AIConciergeChat.tsx` — mount the new button in the composer row; render the live transcript bubble during a turn; append the final user + assistant messages to the normal message list so history is identical to text mode.

4. Billing/quotas — each completed turn calls `lovable-concierge` exactly once, so the existing per-query counter and Frequent Chraveler paywall just work. No double-counting for the STT + TTS legs (they're plumbing, not queries).

5. Hide behind a feature flag `concierge_conversation_mode` (default on for super-admins, off for everyone else until we test) so we can ship and kill-switch without a redeploy.

### Alternative considered (not recommended right now)

True full-duplex realtime (OpenAI Realtime / Gemini Live) — Lovable AI Gateway doesn't currently proxy a realtime websocket endpoint, so this would mean adding direct provider credentials and bypassing the gateway, which violates the "Lovable manages the voices" requirement and breaks the unified billing story. We can revisit when Lovable exposes it.

## Verification

- Tap ▶ on Coral in Settings → hear "Hi, I'm your **Travel** concierge…" — repeat for Alloy/Sage/Ash/Ballad/Echo/Shimmer/Verse/Marin/Cedar.
- Send a normal text message that contains "Chravel" → reply audio pronounces it "Travel".
- Open Concierge → tap new conversation button → speak "What's on my calendar tomorrow?" → assistant answers aloud, mic auto-reopens, ask a follow-up without tapping anything.
- Query counter increments by exactly 1 per spoken turn.
- Mobile (440px) layout: button doesn't push send off-screen, safe-area respected.

## Out of scope (call out, don't silently defer)

- Real full-duplex (interrupting mid-sentence with overlapping audio) — needs realtime API; tracked for when Lovable Gateway supports it.
- Multi-language voice — staying English-only for v1.
- Voice in the marketing/demo concierge — separate path, will follow once this lands.
