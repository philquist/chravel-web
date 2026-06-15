# Android 15 Edge-to-Edge Play Console Fix Runbook

## Why this exists

Google Play can flag Android 15 releases when the uploaded AAB calls deprecated system-bar or display-cutout APIs. The warning usually names APIs such as `Window.setStatusBarColor`, `Window.setNavigationBarColor`, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`, or `LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT`.

For the `1.0.0` Play Console warning reported on June 15, 2026, the listed callsites were inside React Native and Material Components:

- `com.facebook.react.modules.statusbar.StatusBarModule$setColor$1.runGuarded`
- `com.facebook.react.modules.statusbar.StatusBarModule.getTypedExportedConstants`
- `com.facebook.react.views.view.WindowUtilKt.enableEdgeToEdge`
- `com.facebook.react.views.view.WindowUtilKt.statusBarHide`
- `com.facebook.react.views.view.WindowUtilKt.statusBarShow`
- `com.google.android.material.bottomsheet.BottomSheetDialog.onCreate`
- `com.google.android.material.internal.EdgeToEdgeUtils.applyEdgeToEdge`
- `com.google.android.material.sidesheet.SheetDialog.onCreate`

Those callsites are native Android artifact callsites. They are not produced by this web source tree unless the Android project that builds the AAB is present and synced.

## Release gate

Run this before promoting any Android release:

```bash
npm run qa:android15-edge
```

The gate intentionally fails when `android/` is missing, because a Play Store AAB cannot be verified without the native source that produced it. If a native Android project is checked in, the gate scans Kotlin, Java, XML, Gradle, and JS/TS wrapper files for the deprecated edge-to-edge patterns Google Play reports.

## Required native fixes

Apply these in the Android project that produces the Play Console AAB.

### 1. Remove app-level status and navigation bar color writes

Search for:

```text
StatusBar.setBackgroundColor
<StatusBar backgroundColor=
setStatusBarColor
statusBarColor =
setNavigationBarColor
navigationBarColor =
```

Replace direct color writes with edge-to-edge layout plus inset-aware padding. Status bar icon style changes are still allowed when they are needed for contrast.

### 2. Upgrade the native dependency stack together

Inspect:

```text
android/build.gradle
android/app/build.gradle
android/gradle/libs.versions.toml
package.json
```

Upgrade React Native, AndroidX, and Material Components to versions that support Android 15 edge-to-edge behavior for your app stack. Do not patch library internals in `node_modules` or Gradle caches.

### 3. Normalize display cutout handling

Search for:

```text
LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
android:windowLayoutInDisplayCutoutMode="shortEdges"
android:windowLayoutInDisplayCutoutMode="default"
```

Use Android 15-compatible cutout behavior and verify content with display cutout simulation. Do not use cutout settings as a workaround for missing inset handling.

### 4. Verify sheets and keyboard states

Material bottom sheets and side sheets sit near system bars, so they need explicit QA after dependency upgrades:

- Primary buttons remain above gesture and 3-button navigation areas.
- Drag handles remain visible and tappable.
- Scrollable sheet content has bottom inset padding.
- Focused inputs remain visible when the keyboard opens.
- Dark and light status bar icon contrast stays readable.

## Manual verification checklist

Use an Android 15 emulator or device and test all of the following before production promotion:

- Gesture navigation, portrait
- Gesture navigation, landscape
- 3-button navigation, portrait
- 3-button navigation, landscape
- Display cutout simulation
- Keyboard-open forms
- Every bottom sheet and side sheet flow
- Main app shell with long scroll content
- First launch after a clean install

## Play Console confirmation

1. Build a new signed AAB from the patched Android source.
2. Upload it to Internal testing first.
3. Wait for Play Console analysis to finish.
4. Confirm the Android 15 edge-to-edge warning is gone or narrowed to a known third-party dependency that has no newer compatible version.
5. Promote only after manual Android 15 device QA passes.
