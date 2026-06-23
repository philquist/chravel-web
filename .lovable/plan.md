## Context: your stack changes everything

This Lovable repo is a **pure web app**. Your iOS submission is built by **Expo + EAS**, and the Expo project (with `app.json`/`app.config.js`, `eas.json`, native config) lives in a **separate repo** — not here. That means:

- I cannot edit your `Info.plist` from Lovable, because Expo generates it from `app.json` at build time and that file isn't in this project.
- I cannot configure Supabase's Apple provider from Lovable — none of my Supabase tools touch Auth provider settings; that's dashboard-only.
- I *can* improve the web-side Apple sign-in code in this repo (e.g. add native `expo-apple-authentication` support behind a runtime check) **if** your Expo app actually loads JS from this repo (WebView wrapper or shared codebase).

So the realistic split:
- **Expo `app.json` edits** → Claude Code / Codex prompt against your Expo repo (I'll write it).
- **Supabase Apple provider verification** → agentic browser script (I'll write it).
- **App Review reply** → agentic browser script for App Store Connect (I already wrote one; can refresh if needed).

Before I finalize, I need one piece of info — see the question below the plan.

---

## Plan

### 1. Fix Guideline 2.5.4 (background audio) — Expo `app.json`

**Why Lovable can't do it:** the Expo native project / `app.json` is in a different repo. EAS Build reads `ios.infoPlist` from that file to generate `Info.plist`. Lovable doesn't touch it.

**Deliverable from me:** a paste-ready Claude Code / Codex prompt for your **Expo repo** that:
1. Opens `app.json` (or `app.config.js` / `app.config.ts`).
2. Locates `expo.ios.infoPlist.UIBackgroundModes`.
3. Removes the `"audio"` entry. If the array becomes empty, removes the `UIBackgroundModes` key entirely.
4. Also checks `expo.plugins` for `expo-av`, `expo-audio`, `expo-music`, `react-native-track-player`, etc. — these plugins auto-inject `audio` into `UIBackgroundModes`. If found, switches them to a config that does **not** request background audio (or removes the plugin if unused).
5. Runs `npx expo prebuild --clean` (if using bare workflow) or just bumps the iOS build number.
6. Triggers `eas build --platform ios --profile production --auto-submit` (or your equivalent).

### 2. Fix Guideline 2.1(a) (Apple Sign In on iPad)

Your current code (`src/hooks/useAuth.tsx:875`) calls `supabase.auth.signInWithOAuth({ provider: 'apple' })`, which opens a web OAuth flow and relies on a redirect back to `https://chravel.app/auth-callback`. Inside an Expo iOS app on iPadOS 26.5 this is fragile because:
- Without `ios.associatedDomains: ["applinks:chravel.app"]` in `app.json`, the callback opens Safari and never returns.
- Apple Sign In on iOS **expects** native Sign in with Apple (`AuthenticationServices`), not a web OAuth round-trip. Reviewers test the native button.

**Two fixes, in order of preference:**

**Option A (recommended) — native Sign in with Apple via Expo**
- In your Expo repo: add `expo-apple-authentication`, declare it in `app.json` plugins, and add the `usesAppleSignIn: true` entitlement.
- In this Lovable repo: update `signInWithApple` in `src/hooks/useAuth.tsx` to detect the native environment (already has `isInstalledApp()`), call `AppleAuthentication.signInAsync(...)`, then pass the returned `identityToken` to `supabase.auth.signInWithIdToken({ provider: 'apple', token })`. No browser, no universal link, no callback.
- Keep the existing web OAuth flow as the non-installed fallback.

**Option B (fallback) — fix universal links**
- Add `ios.associatedDomains: ["applinks:chravel.app"]` to `app.json`.
- Confirm `public/.well-known/apple-app-site-association` (already in this repo) returns valid JSON with your Team ID + bundle ID and `Content-Type: application/json`.
- Rebuild via EAS.

**Deliverable from me:**
- A Claude Code / Codex prompt for your **Expo repo** that installs `expo-apple-authentication`, edits `app.json`, and rebuilds.
- A code change in **this Lovable repo** to `src/hooks/useAuth.tsx` that branches `signInWithApple` to use the native flow when running inside the installed app.

### 3. Verify Supabase Apple provider (your "option C")

I don't have a tool that reads or writes Supabase Auth provider settings — only DB, edge functions, storage, and logs. So I can't automate this from Lovable.

**Deliverable from me:** an agentic browser script for **Claude Code / a browser agent** that:
1. Opens the Supabase dashboard for project `jmjiyekmxwsxkfnqwyaa`.
2. Navigates to Authentication → Providers → Apple.
3. Confirms the provider is enabled and that Services ID, Team ID, Key ID, and the `.p8` private key are populated (without revealing values).
4. Confirms the **Authorized Redirect URI** matches `https://jmjiyekmxwsxkfnqwyaa.supabase.co/auth/v1/callback`.
5. Reports pass/fail for each field back to you.

### 4. App Store Connect reply

A refreshed agentic-browser script that submits a reply citing the Expo `app.json` change and the native Sign in with Apple migration (instead of the Xcode-flavored wording from my previous answer).

---

## Files that will change

**In this Lovable repo (only if you confirm the JS is shared with the Expo app):**
- `src/hooks/useAuth.tsx` — branch `signInWithApple` to native path when `isInstalledApp()` is true.

**In your separate Expo repo (you'll run a Claude Code / Codex prompt that I provide):**
- `app.json` or `app.config.{js,ts}` — remove `audio` from `UIBackgroundModes`; add `expo-apple-authentication` plugin and `usesAppleSignIn` entitlement; add `ios.associatedDomains`.
- `package.json` — add `expo-apple-authentication`.

**No edits at all:**
- `appstore/INFO_PLIST_ADDITIONS.md` and other Xcode-flavored docs (stale anyway because you're on Expo).

---

## One blocking question before I finalize

**Does your Expo iOS app actually run the JavaScript from this Lovable repo** (e.g. via a WebView pointing at `chravel.app`, or by importing this codebase), or is the Expo project a **separate React Native codebase** with its own auth screen?

- If **shared / WebView-of-chravel.app** → I'll update `src/hooks/useAuth.tsx` here for the native Apple flow.
- If **separate React Native code** → the Apple Sign In code change belongs in your Expo repo, and Lovable's role is limited to writing the Claude Code prompts + the browser scripts.

Reply with which one, and I'll switch to build mode and ship the appropriate deliverables.