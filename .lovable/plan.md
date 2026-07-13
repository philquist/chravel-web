
# Chat "Holy Grail" Upgrade — Phased Plan

Bring trip chat to iMessage/WhatsApp quality inside Chravel's Luxury Dark brand (gold accents, DM Serif Display/Fira Sans, no purple gradients). Each phase ships independently, is behind no flag by default, and preserves existing send/broadcast/payment/mention/upload behavior.

## Phase 1 — Polish Pass (foundation)
Perceived-quality jump with near-zero risk. Ships first.

- **Message grouping**: collapse consecutive messages from the same sender within a 3-minute window. Tighter vertical spacing between grouped bubbles (2px), normal spacing (12px) between senders.
- **Bubble tails**: render a tail only on the *last* bubble in a group (SVG or CSS notch). Own = gold-tinted right tail; other = surface-tinted left tail. Avatar + sender name render only on the first bubble of the group (other side); own side stays avatar-less.
- **Day separators**: sticky, centered pill ("Today", "Yesterday", "Mon, Nov 12") inserted when the calendar day changes between adjacent messages.
- **Time gaps**: inline centered timestamp only when >15 min gap between messages; hover/tap to reveal exact time on any bubble.
- **"New messages" divider**: single horizontal rule inserted at the first unread message when the chat opens; clears on next mount.
- **Spring entrance**: new incoming/own bubbles animate in with a subtle scale-in (0.96→1) + fade over 180ms, transform-origin on the tail side. Respects `prefers-reduced-motion`.
- **Typing indicator**: three-dot animated bubble on the receiving side using existing typing presence data. Auto-hides after 4s idle.

## Phase 2 — Interactions (reactions + reply)
Wires the "Tapback" moment and quote-reply flow.

- **Long-press / double-tap reaction bar**: floats above the pressed bubble with 6 quick emojis (❤️ 👍 👎 😂 ‼️ ❓) + "＋" for full picker. Reuses existing `message_reactions` table (schema already present). Own reactions toggle off on re-tap.
- **Reaction chips**: rendered as a small pill *attached to the bubble corner* (iMessage style), showing emoji + count. Tap to see who reacted.
- **Long-press action menu**: below the reaction bar — Reply, Copy, Forward (stub → follow-up), Delete (own only), Report (other only). Uses shadcn ContextMenu on desktop, custom sheet on mobile.
- **Swipe-to-reply**: horizontal swipe on a bubble (right for received, left for own, ~60px threshold) reveals a reply arrow + haptic tick, releases into an inline "Replying to …" chip above the composer.
- **Inline reply chip in bubble**: sent replies render a compact quoted preview (sender + one-line snippet) that scrolls to the original on tap.
- **Read receipts + delivered ticks**: single check = sent, double = delivered, gold double = read. Only shown on *own* messages, only when the trip's privacy setting allows (respect existing `trip_privacy_configs`).

## Phase 3 — Media & Links
Makes shared content feel native.

- **Image mosaic**: 2–4 images sent together render in an iMessage-style grid (2-up, 3-up staircase, 4-up quad) inside a single bubble instead of stacked attachments. 5+ shows first 4 with "+N" overlay.
- **Rich URL unfurls in-bubble**: pasted URLs generate a stacked preview card (image + title + domain) using the existing `unfurl` service. Card lives *inside* the bubble; failed unfurls fall back to plain link.
- **Tappable link previews from Places tab**: internal `chravel://place/...` and Places links render a mini place card (photo + name + distance from Base Camp) — leverages existing Google Places integration.
- **Video thumbs with duration badge**; GIFs autoplay muted on scroll into view.

## Phase 4 — Voice Notes
The WhatsApp "moat" feature.

- **Hold-to-record button** on the *left* of the composer (replaces the mic-affordance gap). Live waveform draws as you speak; timer shows elapsed.
- **Swipe-left-to-cancel** and **swipe-up-to-lock** (hands-free continue). Release to send, release-inside-cancel-zone to discard.
- **Playback bubble**: static waveform (peaks sampled at record time), play/pause, scrubber, 1x/1.5x/2x speed toggle. Unplayed = gold accent, played = muted.
- **Storage**: Supabase Storage bucket `trip-voice-notes` with RLS mirroring `trip-media`; message row references the object with `media_type = 'voice'` and `duration_ms` metadata.
- **Auto-transcript (optional, gated)**: server-side transcription via existing AI stack behind `voice_note_transcripts` feature flag; displays under the waveform when ready.

## Cross-cutting

- **Brand fidelity**: all new surfaces use semantic tokens (`--gold`, `--surface`, `--foreground`) — no hardcoded colors, no purple. Own bubble = `hsl(var(--gold) / 0.18)` fill + gold text; other = `--muted` fill + `--foreground` text.
- **Mobile-first**: 44px tap targets, `visualViewport`-aware composer, safe-area insets preserved. Reaction bar and swipe gestures tested in portrait + landscape.
- **Demo mode**: mock messages get grouped/reactioned/replied purely at render time — no mock data mutation.
- **Feature flags**: `chat_reactions_v2`, `chat_swipe_reply`, `chat_media_mosaic`, `chat_voice_notes` seeded on in migrations so we can kill any phase in 60s without redeploy.
- **Tests**: unit tests for grouping/day-separator logic; RTL tests for reaction toggle + swipe-to-reply gesture; integration test per phase.

## Technical Notes

Files touched per phase (approximate):
- **P1**: `src/features/chat/components/MessageList.tsx`, `MessageBubble.tsx` (new: `MessageGroup.tsx`, `DaySeparator.tsx`, `TypingBubble.tsx`), `src/features/chat/utils/groupMessages.ts` (new).
- **P2**: `MessageBubble.tsx`, new `ReactionBar.tsx`, `MessageActionMenu.tsx`, `useSwipeToReply.ts`; hook into existing `message_reactions` table + realtime channel.
- **P3**: new `MediaMosaic.tsx`, `InBubbleLinkCard.tsx`; extend `useLinkUnfurl` to inline mode.
- **P4**: new `VoiceRecorder.tsx`, `VoicePlayer.tsx`, `useVoiceRecording.ts`; migration for `trip-voice-notes` bucket + RLS + `trip_chat_messages.duration_ms` column; feature flag row.

No new heavy deps. Waveform via `MediaRecorder` + Web Audio API `AnalyserNode` (no wavesurfer.js unless needed). Reactions/swipe use existing gesture primitives — no framer-motion additions.

## Shipping order

P1 (this session) → P2 → P3 → P4. Each phase = own PR, own verification, independently revertible via its feature flag.
