# Voice Provider Migration Note — ARCHIVED

> **Status: historical.** This document previously described a Google Cloud TTS →
> Gemini TTS migration that is **no longer the live Concierge read-aloud path**.
>
> **Current source of truth:**
> [`CONCIERGE_READ_ALOUD_TTS.md`](./CONCIERGE_READ_ALOUD_TTS.md)
>
> Live stack (2026-07+): `concierge-voice-tts` → Lovable AI Gateway
> (`openai/gpt-4o-mini-tts`) with 10 OpenAI voices from Settings. Secret:
> `LOVABLE_API_KEY`. No `VITE_CONCIERGE_TTS_ENABLED` client flag.

Keep this file only so old links in PRs / indexes do not 404. Do not follow the
verification steps below for production work.

---

## What this doc used to claim (obsolete)

The `concierge-tts` edge function (Google Cloud TTS) was described as superseded by
`gemini-tts` (Gemini 3.1 Flash TTS Preview), routed by
`VITE_CONCIERGE_TTS_ENABLED=true`.

That routing **does not exist** in the current SPA. The frontend calls
`/functions/v1/concierge-voice-tts` exclusively for read-aloud and settings voice
preview.

### Obsolete verification (do not use)

```bash
# OBSOLETE — gemini-tts is not the Concierge read-aloud path
# Set VITE_CONCIERGE_TTS_ENABLED=true
# supabase functions deploy gemini-tts
# curl .../functions/v1/gemini-tts ...
```

### Obsolete rollback (do not use)

```bash
# OBSOLETE — VITE_CONCIERGE_TTS_ENABLED is not consulted by useConciergeReadAloud
# Set VITE_CONCIERGE_TTS_ENABLED=false
```

### Where legacy functions still appear

These may remain deployed for unrelated/legacy callers or cleanup debt:

- `google-tts` — Google Cloud TTS (`GOOGLE_CLOUD_TTS_API_KEY`)
- `concierge-tts` / `gemini-tts` — earlier Concierge experiments
- `elevenlabs-tts` — early provider swap era

Before deleting any of them, grep the repo + edge logs for callers. New features
must use `concierge-voice-tts` only.
