# Trip Cover Photo — End-to-End QA Checklist

Scope: verify **Create**, **Replace**, **Remove**, and **Refresh persistence** for trip cover photos across **Web (desktop)**, **PWA (installed)**, **iOS Safari/Capacitor wrapper**, and **Android Chrome/Capacitor wrapper**.

Pass criteria: every row is ✅ on every platform before we mark the cover-photo bug closed.

---

## 0. Pre-flight (run once per platform)

| # | Step | Expected |
|---|------|----------|
| 0.1 | Sign in with a real (non-demo) account | Dashboard loads; no Trip Not Found flash |
| 0.2 | Open DevTools → Network → throttle to "Fast 3G" | Used for upload race-condition checks |
| 0.3 | Confirm Supabase session present (`supabase.auth.getSession()`) | `data.session` is non-null |
| 0.4 | Confirm `trip-covers` bucket reachable (Network: 200 on a known cover URL) | Public read works |

Test asset set: `small.jpg` (~200 KB), `medium.png` (~3 MB), `large.webp` (~9.5 MB), `oversize.jpg` (~12 MB), `bad.txt` (wrong MIME).

---

## 1. CREATE — set cover photo at trip creation

| # | Action | Expected |
|---|--------|----------|
| 1.1 | New Trip → upload `small.jpg` → Save | Trip created, cover renders immediately on dashboard card |
| 1.2 | New Trip → upload `medium.png` → Save | Cover renders; no console errors; storage path is `trips/{trip_id}/cover.png` |
| 1.3 | New Trip → upload `large.webp` (≤10 MB) → Save | Succeeds; correct extension preserved |
| 1.4 | New Trip → upload `oversize.jpg` (>10 MB) → Save | Blocked client-side with clear toast; no orphan storage object |
| 1.5 | New Trip → upload `bad.txt` | Blocked with "Unsupported file type" toast |
| 1.6 | New Trip → Save **without** photo | Trip created with default/placeholder cover, no error |
| 1.7 | New Trip → upload + Save under throttled 3G | Single upload attempt succeeds; no duplicate `trip_members` insert; no RLS 403 |

---

## 2. REPLACE — change cover on existing trip

| # | Action | Expected |
|---|--------|----------|
| 2.1 | Open existing trip → Settings → Replace cover with `medium.png` | Old object overwritten at canonical path; new image visible within 2s |
| 2.2 | Replace twice in succession (different files) | Final image wins; no stale cache; no orphaned storage objects |
| 2.3 | Replace as **trip creator** | 200 OK |
| 2.4 | Replace as **trip admin** (non-creator) | 200 OK |
| 2.5 | Replace as **regular member** | 403 / disabled UI (per RLS) |
| 2.6 | Replace as **non-member** (direct API hit) | 403 from storage RLS |

---

## 3. REMOVE — clear cover

| # | Action | Expected |
|---|--------|----------|
| 3.1 | Settings → Remove cover | Falls back to placeholder; storage object deleted; `trips.cover_image_url` nulled |
| 3.2 | Remove then immediately re-upload | New cover uploads cleanly to canonical path |
| 3.3 | Remove as non-admin member | Action disabled / 403 |

---

## 4. REFRESH PERSISTENCE

| # | Action | Expected |
|---|--------|----------|
| 4.1 | After Create — hard refresh (Cmd/Ctrl+Shift+R) | Cover still rendered from Supabase URL |
| 4.2 | After Replace — close tab, reopen app | New cover renders, not the old one |
| 4.3 | After Remove — refresh | Placeholder shown; no broken-image icon |
| 4.4 | Sign out, sign back in | Cover persists across sessions |
| 4.5 | Open same trip on a 2nd device | Cover matches within 5s (realtime/refresh) |
| 4.6 | Service worker active (PWA) → upload new cover → refresh | New cover wins (NetworkFirst on HTML; image cache busts via URL hash/timestamp) |

---

## 5. Platform-specific gates

### 5.1 Web (Chrome, Safari, Firefox — desktop)
- File chooser opens; drag-and-drop onto cover area also works.
- Image preview shown before save.
- Console clean (no 4xx/5xx).

### 5.2 PWA (installed from `chravel.app`)
- Install via browser "Add to Home Screen".
- Repeat sections 1–4 inside installed PWA window.
- Verify SW does not serve stale cover after replace (check `Cache-Control` headers; image URL should include cache-busting query/hash or storage-side ETag revalidation).
- Offline → attempt upload → queued or clear "offline" toast (no silent failure).

### 5.3 iOS (Safari + Capacitor wrapper, if shipped)
- Safari: tap cover → choose **Photo Library**, **Take Photo**, **Choose File**. All three paths upload successfully.
- HEIC photos from iPhone camera convert/upload as JPEG (or are accepted by storage).
- Capacitor wrapper: native chooser permission prompt appears once; subsequent uploads do not re-prompt.
- Background the app mid-upload, foreground → upload completes or surfaces a retry toast (no zombie spinner).
- Pinch-zoom does not break layout on the upload sheet.

### 5.4 Android (Chrome + Capacitor wrapper, if shipped)
- Chrome: gallery + camera + Files app pickers all work.
- Capacitor: storage / camera permissions granted on first run.
- Rotate device portrait↔landscape mid-upload → no crash, upload continues.
- Back-button during upload cancels cleanly (no orphan storage object).

---

## 6. Negative / regression guards

| # | Check | Expected |
|---|-------|----------|
| 6.1 | Network tab during Create: only **one** `POST` to `storage/v1/object/trip-covers/...` | No duplicate uploads |
| 6.2 | No `403` from `trip_members` insert immediately followed by a `403` on storage upload (the original race) | Single clean sequence |
| 6.3 | Demo mode unaffected (`localStorage.TRIPS_DEMO_VIEW = 'app-preview'`) | Mock covers untouched |
| 6.4 | RLS: another user's trip cover cannot be overwritten via crafted path `trips/{otherTripId}/cover.jpg` | 403 |
| 6.5 | After bug fix, re-run beta-user repro steps that originally failed | All pass |

---

## 7. Sign-off matrix

| Section | Web | PWA | iOS | Android |
|---------|-----|-----|-----|---------|
| 1. Create | ☐ | ☐ | ☐ | ☐ |
| 2. Replace | ☐ | ☐ | ☐ | ☐ |
| 3. Remove | ☐ | ☐ | ☐ | ☐ |
| 4. Refresh persistence | ☐ | ☐ | ☐ | ☐ |
| 5. Platform gates | ☐ | ☐ | ☐ | ☐ |
| 6. Negative guards | ☐ | ☐ | ☐ | ☐ |

QA owner: ______________ Date: ______________ Build SHA: ______________
