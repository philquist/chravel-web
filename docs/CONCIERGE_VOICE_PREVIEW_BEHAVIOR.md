# Concierge Voice — Preview vs Save Contract

**Invariant:** Previewing a voice in Settings → AI Concierge → Concierge Voice never
mutates the saved `concierge_voice` preference. Only an explicit row tap saves.

## Where this is enforced

`src/features/concierge/components/ConciergeVoicePicker.tsx`

- `previewVoice(voiceId)` — fetches `/functions/v1/concierge-voice-tts`, plays the
  returned audio blob, manages `previewingVoice` local state only. **Does not call
  `setVoice`.**
- `handleSelect(voiceId)` — the **only** caller of `setVoice` (from
  `useConciergeVoicePreference`). Wired exclusively to the row's text button
  (`onClick={() => handleSelect(v.id)}`), not the ▶ preview button.
- The preview ▶/■ button has its own `onClick={() => previewVoice(v.id)}` and
  `aria-label="Preview {voice}"` / `"Stop {voice} preview"` — no save side effect.

## Persistence path (only triggered by row tap)

`handleSelect` → `setVoice` → `useConciergeVoicePreference.setVoice`:
1. Writes `concierge_voice` to `localStorage` (immediate).
2. Upserts `profiles.concierge_voice` for paid users (cross-device sync).

Preview path never touches `localStorage` or `profiles`.

## Manual verification

1. Open Settings → AI Concierge → Concierge Voice. Note the selected row (gold ring).
2. Tap ▶ on any other voice row. Audio plays.
3. Tap ■ (or let it finish). Selected row is unchanged. Reload page — still unchanged.
4. Tap the row text of a different voice. Toast confirms save. Reload — persists.

## Regression guard

If a future change wires preview to also save (e.g., for "auto-preview-on-select"),
that change must update this doc and the in-UI hint in `ConciergeVoicePicker.tsx`:
> "Tap ▶ to preview a voice — previewing never changes your saved selection."
