# Gmail Smart Import — Status & Re-enablement Runbook

## Current status: **disabled**

The Gmail Smart Import UI is hidden behind the `gmail_smart_import` feature
flag (`public.feature_flags`, default `false`). The underlying code, edge
functions, tables, and migrations are intact and production-ready — only the
Settings UI entry point is gated.

## Why it's disabled

Per-user Gmail OAuth requires Google's `gmail.readonly` scope, which Google
classifies as **Restricted**. Until the OAuth app passes a **CASA Tier 2**
security assessment (~$4,500, 4–6 weeks), the app is stuck in Test Mode and
limited to 100 manually allowlisted test users.

> Note: This is **not** the Lovable "Gmail" connector. That connector
> authorizes the builder's single Gmail inbox, shared across all app users.
> Chravel needs each user to connect their own Gmail, which requires the
> custom OAuth flow already built in this repo.

## Architecture (already shipped)

| Layer | Location |
|---|---|
| Settings UI | `src/features/smart-import/components/SmartImportSettings.tsx` |
| Client API | `src/features/smart-import/api/gmailAuth.ts` |
| OAuth edge function | `supabase/functions/gmail-auth/` (`connect` · `callback` · `disconnect`) |
| Import worker | `supabase/functions/gmail-import-worker/` (Gemini-powered parser) |
| Callback page | `src/pages/GmailCallbackPage.tsx` → route `/api/gmail/oauth/callback` |
| Tables | `gmail_accounts`, `gmail_accounts_safe` (view), `gmail_import_jobs`, `gmail_import_message_logs`, `gmail_token_audit_logs` |
| Required secrets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ADDITIONAL_REDIRECT_URIS`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SIGNING_SECRET` (all currently set) |

Security posture: PKCE on the auth code grant, HMAC-signed OAuth state with
10-minute expiry, AES-GCM-encrypted access/refresh tokens at rest, all token
operations logged to `gmail_token_audit_logs`.

## Re-enablement checklist

When you're ready to ship:

1. **Google Cloud Console**
   - Confirm OAuth consent screen lists Chravel's verified domain, Privacy
     Policy, and Terms of Service.
   - For limited beta: add each tester's Google account to the OAuth app's
     Test Users list (max 100). Otherwise consent will be rejected.
   - For general availability: complete CASA Tier 2 assessment and submit
     the app for verification.
   - Verify `GOOGLE_REDIRECT_URI` (currently
     `https://chravel.app/api/gmail/oauth/callback`) is in the app's
     Authorized Redirect URIs, along with every value in
     `GOOGLE_ADDITIONAL_REDIRECT_URIS`.

2. **Flip the flag**

   ```sql
   UPDATE public.feature_flags
   SET enabled = true, rollout_percentage = 100
   WHERE key = 'gmail_smart_import';
   ```

   Effect propagates within 60 seconds (client cache TTL). No redeploy
   required.

3. **Smoke test (on every redirect URI / preview origin)**
   - Sign in → Settings → "Connect Gmail" → complete Google consent →
     verify redirect lands on `/api/gmail/oauth/callback` → confirm account
     appears in the Settings list with a "Connected" badge.
   - Open any trip → run Smart Import → confirm at least one reservation
     parses successfully.
   - Inspect `gmail-auth` and `gmail-import-worker` edge function logs for
     errors.

## Troubleshooting

- **"Failed to initiate connection — Unauthorized"** at the connect step
  means `gmail-auth/connect` could not resolve a Supabase user from the
  caller's JWT. `connectGmailAccount()` now calls
  `supabase.auth.refreshSession()` first when the session is within 60s of
  expiry, which fixes the most common case (stale session after preview
  idle). If it still fires, check that the caller is actually signed in and
  that `supabase.functions.invoke` is forwarding the `Authorization` header.
- **`access_denied` from Google** during consent: the signing-in user is
  not on the Test Users list. Add them in Google Cloud Console.
- **`redirect_uri_mismatch`**: the origin the user hit is not in
  `GOOGLE_ADDITIONAL_REDIRECT_URIS` and not in the Google OAuth client's
  Authorized Redirect URIs. Add it to both.
