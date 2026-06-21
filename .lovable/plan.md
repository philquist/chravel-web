## Diagnosis (what's actually wrong)

Your per-user OAuth flow is **architecturally correct**. The code in `supabase/functions/gmail-auth/index.ts`, `gmail-import-worker/index.ts`, `src/features/smart-import/api/gmailAuth.ts`, and `src/pages/GmailCallbackPage.tsx` is solid: PKCE + HMAC-signed state, encrypted token storage, RLS-safe view, audit log, reconnect signaling, 5-account cap.

**Root cause of "Smart Import doesn't work":** 4 required secrets are missing from Supabase Edge Functions. `validateGoogleConfig()` returns 503 immediately before any OAuth happens.

Missing secrets (confirmed via fetch_secrets):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_TOKEN_ENCRYPTION_KEY` (32-byte base64 for AES-GCM)
- `OAUTH_STATE_SIGNING_SECRET` (random 32+ char string for HMAC)

Secondary issues (minor, found in audit):
1. `GmailCallbackPage` redirects to `/settings` on `?error=`, but Google sometimes returns `error=access_denied` with no `state` — current code doesn't differentiate user-cancelled vs real error in the toast.
2. `resolveGmailOAuthRedirectUri()` uses `window.location.origin` — preview origins (`*.lovable.app`) and prod (`chravel.app`) all need to be registered in Google Cloud **and** in `GOOGLE_ADDITIONAL_REDIRECT_URIS` so the backend allowlist accepts them. Currently only `chravel.app` is the default.
3. No background refresh-token rotation — when access_token expires, the worker already handles refresh inline (verified in `gmail-import-worker/index.ts`), so this is fine. No action needed.

## Plan

### Step 1 — Google Cloud Console setup (you, ~5 min)

In https://console.cloud.google.com → APIs & Services:

1. **Enable Gmail API** (Library → search "Gmail API" → Enable).
2. **OAuth consent screen**: External, app name "Chravel", add Authorized Domains: `chravel.app`, `lovable.app`. Add scopes: `gmail.readonly`, `userinfo.email`, `openid`. Add yourself as Test User while in Testing mode.
3. **Credentials → Create OAuth client ID** (Web application). Register **all** these Authorized redirect URIs:
   - `https://chravel.app/api/gmail/oauth/callback`
   - `https://www.chravel.app/api/gmail/oauth/callback`
   - `https://chravelapp.com/api/gmail/oauth/callback`
   - `https://chravel.lovable.app/api/gmail/oauth/callback`
   - `https://id-preview--20feaa04-0946-4c68-a68d-0eb88cc1b9c4.lovable.app/api/gmail/oauth/callback`
   - `http://localhost:8080/api/gmail/oauth/callback`
4. Copy the **Client ID** and **Client Secret**.

### Step 2 — Add 4 Supabase secrets (I'll prompt you)

I'll call `add_secret` for each once you approve:
- `GOOGLE_CLIENT_ID` = from step 1
- `GOOGLE_CLIENT_SECRET` = from step 1
- `GMAIL_TOKEN_ENCRYPTION_KEY` = generated 32-byte base64 (I'll generate)
- `OAUTH_STATE_SIGNING_SECRET` = generated 48-char random (I'll generate)
- `GOOGLE_ADDITIONAL_REDIRECT_URIS` = comma-separated list of every non-default URI from step 1.3 (so backend allowlist accepts preview + alt domains)

### Step 3 — Code patches (3 small edits)

1. **`src/pages/GmailCallbackPage.tsx`** — distinguish `error=access_denied` (user cancelled, friendly toast, no scary "Connection Failed" headline) from other errors.
2. **`src/features/smart-import/api/gmailAuth.ts`** — when `resolveGmailOAuthRedirectUri()` runs on a preview origin not in the allowlist, the backend silently falls back to `chravel.app` and OAuth round-trips to prod. Add a dev-mode warning in console so you notice the mismatch.
3. **`supabase/functions/gmail-auth/index.ts`** — when `validateGoogleConfig` fails, current error message is generic. Include which secret is missing in the response body so the Settings UI can surface it (already returns it via `errorResponse`, but the frontend toast swallows it — make `connectGmailAccount` surface the 503 message verbatim).

### Step 4 — Verify end-to-end

1. From Settings → Integrations → Connect Gmail: should open Google consent screen.
2. After consent: redirect lands on `/api/gmail/oauth/callback`, token exchange succeeds, account appears in `gmail_accounts_safe` view.
3. From a trip → Smart Import → Scan Inbox: `gmail-import-worker` runs and returns candidates (or "no new items").
4. Disconnect: token revoked at Google, row deleted.

I'll use `supabase--curl_edge_functions` to test `gmail-auth/connect` returns a valid Google OAuth URL after secrets are in.

## Out of scope (deferred — call out per discipline)

- Background refresh-token cron (current inline refresh is sufficient until usage grows).
- Production verification with Google (CASA Tier 2) — `gmail.readonly` is a **restricted scope**; you can ship in Testing mode with up to 100 test users now, but public launch requires a security assessment. Per memory `features/calendar/gmail-smart-import-infrastructure-and-compliance`, this is already documented as a known constraint.

## Risk

LOW. No schema changes, no auth surface changes, no RLS changes. All edits are config + 3 localized code patches. Rollback = delete the 4 secrets.