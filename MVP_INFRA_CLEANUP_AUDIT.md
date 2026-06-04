# MVP Infrastructure Cleanup Audit — LiveKit + Twilio/SMS Removal

**Date:** 2026-06-04
**Branch:** `claude/mvp-infra-cleanup-gkieP`
**Scope:** Surgical removal of overbuilt, non-MVP infrastructure (LiveKit realtime
voice + Twilio/SMS notifications) ahead of App Store submission, with zero
regression to chat, notifications, auth, routing, AI Concierge (text + dictation),
payments, or the mobile wrapper.

---

## Executive Summary

Two infrastructure layers were removed because they added env-var burden, deploy
risk, and review surface without MVP user value:

1. **LiveKit** (+ the parallel OpenAI realtime voice edge function) — wired in for a
   future Gemini-Live bidirectional voice mode that is **not** in the MVP. The
   frontend never used it (voice in the app is Web Speech **dictation** only); the
   live-voice CTA was already gated off. Future voice will be built Google/Gemini-native.
2. **Twilio / SMS notifications** — duplicated the working **push + in-app + email**
   channels and added compliance/deliverability/cost/opt-out surface. Reportedly
   never worked reliably. Fully removed (code + DB schema).

**Result:** push, email, in-app notifications, chat, auth, routing, payments, and the
AI Concierge text/dictation experience are unchanged. No LiveKit/Twilio secrets are
required for local or production builds. `lint`, `typecheck`, `build`,
`lint-migrations`, `check-env-coverage`, and `check-schema-drift` all pass.

---

## LiveKit — references found & removed

| Artifact | Action |
|---|---|
| `agent/` (LiveKit Agents worker: index/tools/prompt/context/dataMessages/voiceModel, Dockerfile, package.json) | **Deleted** |
| `supabase/functions/livekit-token/` (token + room creation) | **Deleted** |
| `supabase/functions/create-openai-realtime-session/` (OpenAI realtime; gated off, no frontend caller) | **Deleted** |
| `.github/workflows/deploy-agent.yml` (LiveKit agent deploy) | **Deleted** |
| `.github/workflows/deploy-functions.yml` (`livekit-token` dispatch option) | **Edited** — option removed |
| `supabase/functions/execute-concierge-tool/index.ts` | **Edited** — removed the dead LiveKit-agent assertion auth path (`X-Agent-Assertion`), dropped the unused service-role-key client; browser/user-JWT auth (the only live path) unchanged |
| `supabase/functions/_shared/security/agentAssertions.ts` (only consumer was the LiveKit agent path) | **Deleted** |
| `.env.example`, `.env.production.example` | **Edited** — removed `LIVEKIT_API_KEY/SECRET/URL`, `VITE_LIVEKIT_WS_URL`, `VITE_VOICE_LIVE_ENABLED`, `VITE_AI_VOICE_PROVIDER` |
| `docs/ops/LIVEKIT_VOICE_READINESS_RUNBOOK.md`, `docs/ai-concierge-voice-migration-audit-2026-05-12.md` | **Deleted** |

**Preserved (NOT LiveKit-only):** Web Speech dictation (`useWebSpeechVoice`,
`useConciergeVoice`, `VoiceButton`, `src/types/voice.ts`); `_shared/vertexAuth.ts`
(used by `concierge-tts` + `fcmV1`); `_shared/voiceToolDeclarations.ts` (text concierge);
`_shared/voiceProductPath.ts` (the honest "voice is dictation-only" disabled guard).

---

## Twilio / SMS — recommendation & removal

**Recommendation taken: FULL surgical removal** (not feature-flag disable). SMS was
woven into the shared notification dispatcher, but every SMS database object was
confirmed SMS-only (no non-SMS dependents), making ordered removal safe.

### Code (push + email + in-app preserved)
- **Shared dispatch:** `notificationDispatchPolicy.ts` and `notificationContentBuilder.ts`
  `DeliveryChannel` is now `'push' | 'email'`; removed SMS routing, retry backoff, the
  `enforcePreferenceAtSendTime` sms branch, `SmsContent`/`buildSms`. `notificationUtils.ts`
  dropped `sms_*` preference fields, `SMS_ELIGIBLE_CATEGORIES`, `isSmsEligible`, the
  `sendSms` decision; the generic `formatTimeForTimezone` helper was relocated here from
  the deleted `smsTemplates.ts` and `event-reminders` repointed.
- **Deleted:** `supabase/functions/_shared/smsTemplates.ts`, `src/pages/SmsTerms.tsx`
  (+ `/sms-terms` route in `App.tsx`/`main.tsx`), `src/lib/__tests__/smsTemplates.test.ts`.
- **Edge functions:** `dispatch-notification-deliveries` (Twilio env, `sendSms`, SMS
  entitlement, `sms_opt_in` query, entire SMS branch removed); `push-notifications`
  (`send_sms` action + `sendSMSNotification` removed); `create-notification` (`smsSent`
  counters / `decision.sendSms` removed).
- **Frontend:** SMS toggles, phone-number capture modals, and test-SMS flows removed from
  the consumer/enterprise/event notification sections, settings, the dev notification
  preview, and `EmergencyBroadcast`; SMS fields dropped from notification types/services/hooks.
- **Tests updated:** `notificationDispatchPolicy.test.ts`, `notificationContentBuilder.test.ts`,
  `useNotificationPreferences.test.tsx`, `useAuth.test.tsx`, `EventNotificationsSection.test.tsx`.

### Database — `supabase/migrations/20260604120000_remove_sms_notifications.sql` (reversible)
- `queue_notification_deliveries()` recreated to fan out **push + email only**.
- Queued `channel='sms'` deliveries marked `skipped` (audit history preserved).
- Dropped: `trigger_enforce_sms_entitlement` + `enforce_sms_entitlement_on_preferences()`,
  `is_user_sms_entitled()`, `check_sms_rate_limit()`, `increment_sms_counter()`,
  table `sms_opt_in`, `valid_sms_phone_number` CHECK + `validate_phone_number()`.
- `should_send_notification()` recreated column-safe (push/email behaviour unchanged).
- Dropped columns `notification_preferences.{sms_enabled, sms_phone_number, sms_sent_today,
  last_sms_reset_date}`. Paired `src/integrations/supabase/types.ts` synced.
- **Intentional:** `notification_deliveries.channel` and `notification_logs.type` CHECK
  constraints left widened (still allow `'sms'`) to avoid failing on historical rows.
  Rollback steps are documented inline in the migration.

---

## External-service cleanup checklist (manual, post-merge)

| Service | Action | Required? | Owner | Status |
|---|---|---|---|---|
| Supabase secrets | Delete `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (no function references them) | Yes | | ☐ |
| Supabase secrets | Delete `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID` | Yes | | ☐ |
| Supabase `config.toml` | Remove stale `[functions.livekit-token]`, `[functions.create-openai-realtime-session]`, `[functions.gemini-voice-session]`, `[functions.gemini-voice-proxy]` stanzas — **file is protected from automated edits; remove manually.** Inert otherwise (functions deleted). | Yes (cosmetic) | | ☐ |
| Supabase functions | Delete deployed `livekit-token` + `create-openai-realtime-session` functions from the project | Yes | | ☐ |
| Vercel | Remove `VITE_LIVEKIT_WS_URL` / `VITE_VOICE_LIVE_ENABLED` / `VITE_AI_VOICE_PROVIDER` env vars | Yes | | ☐ |
| Render | Decommission the LiveKit agent service (if a dedicated service exists) | If applicable | | ☐ |
| Twilio dashboard | Keep the account; stop runtime dependency. Pause the Messaging Service / release the number when convenient. Confirm no Twilio webhook points at deleted routes. | Yes | | ☐ |
| App Store Connect | Ensure metadata/screenshots make no "live voice", "Gemini Live", or "SMS updates" claims | Yes | | ☐ |
| Mobile permissions | Microphone usage strings remain valid (dictation still uses Web Speech) — no change needed | Verify | | ☐ |

---

## Remaining intentional references

- **`realtime_voice` feature flag** (default `false`) left seeded and inert. A test
  (`paymentSplitQuotaMigration.test.ts`) asserts the string exists in the unmodified
  migration `20260531153000`; removing the flag row is cosmetic churn.
- **Widened CHECK constraints** on `notification_deliveries.channel` / `notification_logs.type`
  (see DB section).
- **`_shared/voiceProductPath.ts`** — intentionally kept; returns the honest
  "realtime voice disabled, dictation only" payload.
- **Native `sms:` share links** in `useInviteLink.ts` and the profile phone field —
  these open the device Messages app / are contact-sharing fields, NOT Twilio infra. Kept.
- **Historical reports** (`docs/GEMINI_LIVE_*`, `docs/TWILIO_SMS_ARCHITECTURE_REPORT.md`,
  `docs/SMS_*`) left as dated investigation records; superseded by this audit.

---

## Validation completed

- `npm run lint` — 0 errors (warnings pre-existing).
- `npm run typecheck` — clean.
- `npm run build` — succeeds.
- `npx tsx scripts/lint-migrations.ts` — 0 errors.
- `npx tsx scripts/check-env-coverage.ts` — exit 0; no function references `TWILIO_*`/`LIVEKIT_*`.
- `npx tsx scripts/check-schema-drift.ts` — 0 errors.
- Notification test suites (dispatch policy, content builder, preferences, events, auth) — pass.
- `git grep -i 'livekit'` / `twilio` across `src/` + `supabase/functions/` — only the
  intentional residue above.

## Regression risks & mitigations

1. Stuck queued `'sms'` deliveries → migration marks them `skipped`; trigger stops new ones.
2. Hidden dependent on a dropped DB object → all SMS objects verified SMS-only; shared
   functions (`queue_notification_deliveries`, `should_send_notification`) are
   `CREATE OR REPLACE`d, not dropped.
3. CHECK violation on historical rows → constraints left widened (not tightened).
4. Concierge tool-exec auth regression → only the dead LiveKit-agent path removed; the
   browser/user-JWT path (the sole live path) is byte-for-byte unchanged.

## Future reintroduction

- **Voice:** build bidirectional voice Google/Gemini-native behind a feature flag when the
  product is ready — do not re-add LiveKit unless re-justified.
- **SMS:** the migration's documented ROLLBACK block restores the full SMS schema; a matching
  code revert (this branch) re-enables delivery.
