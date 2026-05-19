## Goal
Reorganize **Personal Settings** (`ConsumerSettings`) so light/dark mode is visible in General Settings, Integrations is folded into General Settings, and any chat-activity controls live under Notifications.

## Findings from the code
1. **Light/Dark toggle already exists** in `src/components/consumer/ConsumerGeneralSettings.tsx` (lines 170–191, "Appearance" block, uses `useTheme`). If you don't see it, you're likely viewing the **per-trip** Trip Settings → General tab (`src/components/TripSettings.tsx`), which is a different screen and never had this toggle. The theme toggle is global and belongs in Personal Settings only.
2. **Integrations** is currently a separate top-level sidebar entry in `ConsumerSettings.tsx` rendering `SmartImportSettings` (Gmail/Calendar imports).
3. **Chat Activity** (`ChatActivitySettings`) is already rendered inside `ConsumerNotificationsSection.tsx` (line 649). It is **not** in Personal → General Settings. It *does* appear in Trip Settings → "Activity" tab via `TripActivitySettings`, which is correct (per-trip scope).

## Changes

### 1. Fold "Integrations" into General Settings
- `src/components/ConsumerSettings.tsx`
  - Remove the `integrations` entry from `ALL_SECTIONS`.
  - Remove the `case 'integrations'` branch from `renderSection`.
- `src/components/consumer/ConsumerGeneralSettings.tsx`
  - Add a new "Integrations" card section (between App Preferences and Data & Storage) that renders `<SmartImportSettings />`.
  - Import `SmartImportSettings` from `@/features/smart-import/components/SmartImportSettings`.

### 2. Confirm Appearance (light/dark) stays in General Settings
- No code change needed — already present. After the user re-opens **Personal Settings → General Settings**, the "Appearance / Light Mode" toggle row will be visible at the top.

### 3. Chat Activity placement
- No code change. It already lives in **Personal Settings → Notifications** (bottom of that panel). If you instead meant the per-trip "Activity" tab inside Trip Settings, tell me and I'll move it under a Notifications sub-section there too.

## Files touched
- `src/components/ConsumerSettings.tsx` (remove Integrations sidebar item)
- `src/components/consumer/ConsumerGeneralSettings.tsx` (embed `SmartImportSettings`)

## Validation
- Open Personal Settings → General Settings: see Appearance (Light Mode toggle) at top, App Preferences, **Integrations (Smart Import)**, Data & Storage, Account Management, Safety.
- Sidebar no longer shows "Integrations" as a separate entry.
- Personal Settings → Notifications still shows Chat Activity at the bottom.
- `npm run typecheck && npm run lint && npm run build` clean.

## Rollback
Revert the two edited files.

## Open question
The light/dark toggle is already in Personal → General Settings. Are you instead viewing the **per-trip Trip Settings → General** tab? If you want the theme toggle added there too (unusual — theme is global), say so and I'll add it; otherwise I'll proceed with the plan above.
