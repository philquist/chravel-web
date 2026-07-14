## Findings

Looking at `src/features/chat/components/ChatInput.tsx`, all three items are already largely wired up — but the `+` menu items are unlabeled/ungrouped, which is probably why attachments don't feel discoverable.

### 1. Mic ↔ Send toggle — already correct
Line 550: the composer renders `VoiceRecordButton` when `inputMessage.trim().length === 0`, otherwise renders the Send button. Typing any character flips to Send; clearing flips back to Mic. No code change needed — I'll verify visually in the running preview after the menu changes and confirm in the delivery notes.

### 2. `+` menu — already contains attachments, needs clearer structure
The dropdown already has: Broadcast, File, Link, Photo, Video, Transcribe voice notes. Problems:
- No visual grouping, so "Photo/Video/File/Link" don't read as "attachments."
- "Photo" uses a Camera icon but opens the photo library (confusing).
- No dedicated "Take Photo" (camera capture) option on mobile.
- Transcribe toggle sits at the bottom with no separator.

## Changes (single file: `src/features/chat/components/ChatInput.tsx`)

1. **Restructure the `+` `DropdownMenuContent`** with `DropdownMenuLabel` section headers and `DropdownMenuSeparator` dividers:
   ```
   ATTACHMENTS
     • Photo Library      (Image icon)   → handleFileUpload('image')
     • Take Photo         (Camera icon)  → new: opens file input with capture="environment"
     • Video              (Video icon)   → handleFileUpload('video')
     • File / Document    (FileText)     → handleFileUpload('document')
     • Link               (Link icon)    → opens existing share-link dialog
   ─────────
   COMPOSE
     • Broadcast          (conditional, unchanged styling)
   ─────────
   PREFERENCES
     • Transcribe voice notes  [On/Off]  (unchanged behavior)
   ```

2. **Add "Take Photo" flow**: extend `handleFileUpload` to accept an optional `capture` argument and set `fileInputRef.current.capture = 'environment'` before `.click()`; reset it afterward so library picks still work.

3. **Swap the "Photo" icon** from `Camera` → `Image` so the icon matches "photo library," freeing `Camera` for the new "Take Photo" item.

4. **Import** `DropdownMenuLabel` and `DropdownMenuSeparator` from `@/components/ui/dropdown-menu`.

No changes outside this file. No business-logic changes — same handlers, same upload pipeline (`shareMultipleFiles`, `shareLink`), same broadcast gating (`canSendBroadcast`), same voice-notes flag gating.

## Verification

- Load a trip chat in the preview, open the `+` menu, confirm the three grouped sections render with dividers.
- Tap Photo Library / Video / File → native picker opens with correct `accept`.
- Tap Take Photo on mobile viewport → camera capture opens.
- Tap Link → existing share-link dialog opens.
- Type into the composer → right button flips from Mic to Send; clear the text → flips back.
- Run `npm run typecheck` and the existing `ChatInput.test.tsx` suite.

## Regression risk

LOW — additive menu items, one icon swap, and a small extension to `handleFileUpload` that defaults to the current behavior. No changes to send/broadcast/mention/voice-note logic.
