# App Store Review remediation — June 30, 2026

Apple rejection details:

- Submission ID: `31f5c251-7da4-48c5-bab0-f1430db3e653`
- Review date: June 30, 2026
- Review device: iPad Air 11-inch (M3), iPadOS 26.5
- Version reviewed: 2.0 (58)

## Verdict: fix spans both repos plus App Store Connect

### 2.1(a) Sign in with Apple error after tap

**Primary fix belongs in `Chravel-Inc/chravel-mobile` / native shell.** The App Store build is a native iPad/iOS binary, so Sign in with Apple must use the native `ASAuthorizationController` flow exposed to the web app through the `window.ChravelNative.signInWithApple()` bridge.

`Chravel-Inc/chravel-web` already prefers that native bridge when present, exchanges the native Apple identity token through Supabase `signInWithIdToken`, and only falls back to web OAuth when no native bridge is available. If App Review sees an error immediately after tapping Sign in with Apple in the binary, the most likely release-blocking cause is that the submitted native shell either:

1. does not inject `window.ChravelNative.signInWithApple`,
2. returns an incomplete credential (`identityToken` or raw nonce missing),
3. hashes/passes the nonce incorrectly, or
4. does not have the native Apple capability / associated identifiers configured for the App Store build.

**`Chravel-Inc/chravel-mobile` release requirements:**

- Enable the Sign in with Apple capability on the iOS target.
- Implement/inject `window.ChravelNative.signInWithApple()` before the web app renders auth UI.
- Generate a cryptographically random raw nonce in native code.
- Pass `SHA256(rawNonce)` to `ASAuthorizationAppleIDRequest.nonce`.
- Return the raw nonce, Apple identity token, and authorization code to `Chravel-Inc/chravel-web`.
- Smoke test on a clean iPad install and an update install before resubmitting.

**`Chravel-Inc/chravel-web` responsibilities:**

- Keep the native bridge contract stable.
- Keep the Supabase `signInWithIdToken({ provider: 'apple', token, nonce: rawNonce })` exchange path working.
- Keep Universal Link / external OAuth fallback for web and legacy shells only.

### 2.1(b) subscription IAP products not submitted

**This cannot be fixed by code alone.** Apple is explicitly blocking review because App Store Connect has subscription references in the binary, but the corresponding In-App Purchase products have not been submitted for App Review.

**Primary fix belongs in App Store Connect + RevenueCat, with product ID parity in both repos.** The products referenced by the web billing config and RevenueCat integration must exist in App Store Connect, be attached to the submitted app version, include required metadata and screenshots, and be linked in RevenueCat offerings.

Required iOS product IDs currently referenced by `Chravel-Inc/chravel-web`:

- `com.chravel.explorer.monthly`
- `com.chravel.explorer.annual`
- `com.chravel.frequentchraveler.monthly`
- `com.chravel.frequentchraveler.annual`
- `com.chravel.pro.starter.monthly`
- `com.chravel.pro.growth.monthly`
- `com.chravel.trippass.explorer`
- `com.chravel.trippass.frequent`

Enterprise remains contact-sales; Pro annual IAPs are not part of the 2.0(60) submission. If any of the eight products above are not meant to be sold in the iOS binary, remove that product's UI/reference from the iOS-native surface before submission. Otherwise submit every referenced product with the binary.

## Once-and-for-all release checklist

1. `Chravel-Inc/chravel-mobile`: ship native Apple sign-in bridge and verify it is present in the binary.
2. `Chravel-Inc/chravel-web`: keep Apple bridge contract and product IDs unchanged unless coordinated with mobile and App Store Connect.
3. App Store Connect: create/submit all referenced IAP products with screenshots and metadata.
4. RevenueCat: attach every App Store product to the current offering and map entitlements.
5. Supabase: confirm Apple provider supports native id-token sign-in for the app bundle/service configuration.
6. QA: clean-install and update-install version 2.0 on an iPad, tap Sign in with Apple, complete auth, then open all upgrade/paywall surfaces and verify products load.

## App Review reply template

We fixed the Sign in with Apple issue by using the native iOS Sign in with Apple flow in the app binary and exchanging the Apple identity token with Supabase, avoiding the previous web OAuth handoff on iPad. We also submitted the referenced In-App Purchase products for review with this binary and linked them to our RevenueCat offering. Please test on iPadOS using a clean install of version 2.0 build 58 or newer.
