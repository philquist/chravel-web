# Gmail Smart Import — Diagnosis & Path Forward

## What you currently have (custom per-user Gmail OAuth)

This is **NOT** the Lovable Gmail connector — and it can't be. Lovable's Gmail connector authorizes **YOUR (builder's)** Gmail inbox, shared across all app users. Chravel needs **each user** to connect **their own** Gmail to scan their reservations. That requires per-user OAuth, which is what you already built:

- **Frontend:** `src/features/smart-import/components/SmartImportSettings.tsx` → calls `connectGmailAccount()` in `src/features/smart-import/api/gmailAuth.ts`
- **Edge function:** `supabase/functions/gmail-auth/index.ts` with three actions: `connect`, `callback`, `disconnect` (PKCE + HMAC-signed state, AES-GCM token encryption — solid)
- **Worker:** `gmail-import-worker` (Gemini-powered reservation parsing)
- **Tables:** `gmail_accounts`, `gmail_accounts_safe` (view), `gmail_import_jobs`, `gmail_import_message_logs`, `gmail_token_audit_logs`
- **Callback route:** `/api/gmail/oauth/callback` → `GmailCallbackPage.tsx`
- **Secrets configured:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SIGNING_SECRET`, `GOOGLE_ADDITIONAL_REDIRECT_URIS` ✅

## Why you saw "Failed to initiate connection — Unauthorized"

The screenshot's "Unauthorized" comes from `gmail-auth/index.ts:119` — `supabaseClient.auth.getUser()` returned no user. The UI shows you signed in as `ccamechi@gmail.com`, so the user session exists locally but the JWT didn't reach the edge function (or was stale). Common causes:

1. **Stale/expired session token** at the time of click (most likely after long preview idle).
2. **`supabase.functions.invoke` not forwarding Authorization** because the call ran before auth hydration completed.
3. (Already ruled out — secrets all present, so we'd see 503, not 401.)

## The bigger blocker (compliance, per project memory)

Even after fixing the 401, `gmail.readonly` is a **Restricted scope** in Google Cloud:
- Requires published Privacy Policy + ToS pointing to the verified domain
- Requires **CASA Tier 2 security assessment (~$4,500+, ~4-6 weeks)**
- Until that's done, your OAuth app is stuck in **Test Mode → max 100 test users** who must be added manually in Google Cloud Console
- Your own email (`ccamechi@gmail.com`) needs to be on the test-users allowlist or it will be rejected at consent screen

## Recommended path: **Hide it for now, keep code intact**

Given the CASA cost/timeline, shipping it to general users is months away. Best move:

### Plan

1. **Feature-flag the Gmail UI off in Settings**
   - Wrap the Gmail card in `SmartImportSettings.tsx` (or its parent in the Settings sheet) with a `useFeatureFlag('gmail_smart_import')` check defaulting to `false`.
   - Add the kill-switch row to `public.feature_flags` via a new migration so you can flip it on without redeploying.
   - When off, render nothing (no "Coming soon" — per your production-UI-visibility rule).

2. **Hide all marketing mentions of Gmail Smart Import**
   - Sweep landing pages (`src/components/landing/**`), feature lists, and any pricing/marketing copy for "Smart Import", "Gmail", "scan inbox" references and gate or remove them.
   - Leave the actual feature code, migrations, edge functions, and tables untouched — they're production-ready.

3. **Diagnose the 401 in parallel (cheap, no compliance dependency)**
   - Add a session-refresh + guard in `connectGmailAccount()`: call `supabase.auth.getSession()` first; if `expires_at` is past or `session` is null, call `supabase.auth.refreshSession()` before invoking the function. This fixes the most likely cause of intermittent 401s.
   - Log `[gmail-auth]` more verbosely on the 401 path (whether Authorization header was present) so we can confirm root cause when we re-enable.

4. **Document the launch checklist** in `docs/gmail-smart-import.md`:
   - Flip feature flag `gmail_smart_import = true`
   - Confirm OAuth app verified (CASA Tier 2 passed) OR test users added in Google Cloud Console
   - Confirm `GOOGLE_REDIRECT_URI` matches the production domain
   - Re-test connect → callback → import

### Files to change

- `supabase/migrations/<timestamp>_add_gmail_smart_import_flag.sql` — seed `gmail_smart_import = false`
- `src/features/smart-import/components/SmartImportSettings.tsx` — feature-flag gate
- `src/features/smart-import/api/gmailAuth.ts` — session refresh before invoke + better 401 diagnostics
- Landing/marketing components mentioning Gmail import — hide behind the same flag or remove
- `docs/gmail-smart-import.md` — re-enablement runbook

### What I'd skip (for now)
- Don't drop the tables/functions — relaunching is a flag flip
- Don't pursue CASA approval until you're ready to commit $4.5k + weeks of paperwork

---

**Confirm and I'll execute. If you'd rather I attempt the 401 fix first (skip hiding) and see if your own Google-verified test user gets through, say "fix first" — quickest test is ~10 min.**
