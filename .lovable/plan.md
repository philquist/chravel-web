# Fix full-screen Voice Concierge

Two problems to solve in the full-screen voice overlay:

1. **It looks connected but nothing works.** Dictation never appears under the waveform and no assistant text appears above it — the overlay is stuck at "Starting your voice session…" / "Your words appear here".
2. **It's always dark.** The overlay is hardcoded to a black/gold palette regardless of app theme, so it clashes with light mode.

Scope is limited to the voice overlay + the transcript wiring inside `useRealtimeVoice`. No changes to backend edge functions, tools, models, or the text concierge.

---

## Part 1 — Make dictation + responses actually show

### What we're seeing

`useRealtimeVoice` maps `realtime.messages` to `turns` using `extractMessageText`, which only reads `part.text`. OpenAI Realtime (via AI SDK v7 `useRealtime`) surfaces user speech and assistant speech through additional part types (transcription deltas / audio-transcript parts) that don't carry a plain `text` field on the same shape — so the messages exist but resolve to empty strings, get filtered out by `turn.text.length > 0`, and the overlay renders the empty state forever.

The header status pill also stays on "Connecting…" longer than it should because the overlay treats `phase === 'connecting'` as the copy trigger even after the socket has moved to `connected` with `isCapturing = true` but zero turns.

### Fix

1. **Broaden `extractMessageText`** in `src/features/concierge/hooks/useRealtimeVoice.ts` to accept every AI SDK Realtime transcript part shape:
   - `part.text` (already handled)
   - `part.transcript` (assistant audio transcript)
   - `part.delta` when `part.type` indicates a transcript delta
   - `part.input_transcript` / user transcription part
   - Fall back to empty string; keep join+trim behavior.
   Add short inline comments naming each shape so this doesn't rot.

2. **Add a lightweight dev log** (gated on `import.meta.env.DEV`) that prints unknown message part types once per session. This is a diagnostic aid so if the SDK changes shapes again we see it in the console instead of silently rendering nothing. No production logging.

3. **Overlay copy states** in `RealtimeVoiceOverlay.tsx`:
   - Show "Starting your voice session…" only while `phase === 'connecting'`.
   - Once `phase` is `listening`/`speaking` with no turns yet, show "Listening — say hello to your concierge" above the wave and keep the mic hint below.
   - When the user has spoken but the assistant hasn't replied yet, keep the user's latest line visible below and show a subtle "…" placeholder above.

4. **Live user transcript while speaking**: `useRealtimeVoice` already exposes `latestUserText`. Pass it through so the below-line region shows the in-progress utterance even before the message part is finalized. Same for `latestAssistantText` above the line (used as the "current" line when it hasn't been committed as a message yet).

### How we'll verify

- Open the overlay in the preview, tap Start, speak "hello", confirm:
  - "Listening" pill appears within ~1s of Start.
  - The word "hello" (or close) appears below the wave.
  - The concierge's spoken reply appears above the wave as it speaks.
- Watch DevTools console for the "unknown part type" diagnostic; it should be silent for normal traffic.

---

## Part 2 — Theme-aware overlay

Right now the overlay hardcodes:
- `bg-gradient-to-b from-[#0b0b0f] via-[#0d0c12] to-black/95`
- `text-white`, `text-white/40`, `text-white/70`
- `bg-white/10`, `bg-white/15`
- Status pill uses `bg-[#c49746]/15 text-[#feeaa5]`

That works in dark mode, but in light mode the surrounding app is cream and the overlay is a black rectangle — the same class of contrast bug we just fixed for the search modal.

### Fix

Rewrite the overlay to use semantic tokens so it inherits the current theme:

- Container background → `bg-background/95` with a subtle themed gradient using `from-background via-background to-muted/40`, plus `backdrop-blur-xl`.
- Text: `text-foreground` for the current line, `text-muted-foreground` for prior lines and hints.
- Buttons: use `bg-muted hover:bg-muted/80 text-foreground` for the End button; use `Button` variant `ghost` semantics for the close X.
- Status pill:
  - Idle/listening/speaking → `bg-gold-primary/15 text-gold-primary border border-gold-primary/30` (gold reads on both themes).
  - Error → `bg-destructive/15 text-destructive border border-destructive/30`.
- Keep the gold waveform colors as-is — the gold gradient is a brand accent and reads on both light and dark backgrounds; only nudge the SVG drop-shadow opacity down slightly for light mode via a wrapper class.
- Mic icon + "Your words appear here" → `text-muted-foreground`.

No changes to layout, spacing, or the wave animation — only tokens.

### How we'll verify

- Toggle the app between light and dark theme, open the overlay in both, check:
  - Text is readable in both modes (foreground vs background contrast, not white-on-cream).
  - Status pill, End button, and close X all have visible borders/hover in both modes.
  - Waveform still reads on both backgrounds.

---

## Files touched

```text
src/features/concierge/hooks/useRealtimeVoice.ts        (extractMessageText + dev diag)
src/features/concierge/components/RealtimeVoiceOverlay.tsx  (transcript copy + theme tokens)
```

No backend, no schema, no new deps.

---

## Out of scope

- Changing the realtime model, provider, or session config.
- Rewriting the mint/setup endpoints.
- Persisting voice transcripts to the DB.

If after Part 1 dictation still doesn't surface, next step is to instrument the `mint-realtime-token` + preflight response in the overlay error region so the real gateway/credits/model error becomes visible — but we'll only add that if the transcript-shape fix isn't enough.
