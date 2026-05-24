# Bundle Size Baseline

Generated: 2026-01-28

## Summary

| Category | Size (Raw) | Size (gzip) |
|----------|------------|-------------|
| **Main JS** | 1,009.65 kB | 275.40 kB |
| **CSS** | 210.69 kB | 31.38 kB |
| **PDF (lazy)** | 614.95 kB | 179.98 kB |
| **Charts (lazy)** | 374.05 kB | 97.91 kB |

## Key Code-Split Chunks

| Chunk | Size (Raw) | Size (gzip) |
|-------|------------|-------------|
| index (main) | 1,009.65 kB | 275.40 kB |
| TripDetailModals | 237.18 kB | 65.75 kB |
| Index (home) | 229.89 kB | 54.95 kB |
| SettingsMenu | 176.14 kB | 44.06 kB |
| supabase | 167.58 kB | 41.60 kB |
| react-vendor | 161.36 kB | 52.47 kB |
| pdf | 614.95 kB | 179.98 kB |
| charts | 374.05 kB | 97.91 kB |

## Optimizations Applied

### Phase 7: Performance Polish

1. **React.lazy() Routes** ✅ (Already implemented)
   - All routes use `React.lazy()` with retry logic
   - Custom `retryImport` with exponential backoff

2. **Suspense Boundaries** ✅ (Already implemented)
   - `LazyRoute` component wraps all routes
   - Includes ErrorBoundary and auto-retry

3. **React Query Defaults** ✅ (Added)
   - Global `staleTime: 30s`
   - Global `gcTime: 5min`
   - `refetchOnWindowFocus: false` (reduces network)
   - `refetchOnReconnect: 'always'`

4. **Image Lazy Loading** ✅ (Enhanced)
   - `TripCard` uses `OptimizedImage` component
   - `MediaItem` has `loading="lazy"` and `decoding="async"`
   - `TripMediaRenderer` has `loading="lazy"`

## Notes

- Main bundle exceeds 1MB warning threshold
- Consider further code splitting for TripDetailModals
- PDF and Charts are properly lazy-loaded (only load when needed)

## 2026-05-24 Update — Eager-chunk reductions

| Chunk | Before | After | Change |
|-------|--------|-------|--------|
| `useDeferredPaidAccess` (calendar/event-reachable) | 944.53 kB | 6.26 kB | exceljs removed from static graph |
| `exceljs` | (inlined, eager) | 938.58 kB (lazy) | now loads only on spreadsheet import |
| `streamTripMemberInlineActivity` | 423.13 kB | 121.71 kB | stream-chat extracted to shared chunk |
| `stream-chat` | (inlined) | 301.32 kB (shared, cached) | single deduped chunk |

Root cause of the 944 kB chunk: `exceljs` (~938 kB) was statically imported by
`calendarImportParsers`, `agendaImportParsers`, and `lineupImportParsers`, which
are eagerly pulled in by calendar/event components. Moved to dynamic `import()`
inside each `parseExcel*` function.

Verified already-lazy (no action needed): `recharts`/charts (only reachable from
lazy `SeoDashboard`/`AdvertiserDashboard` routes), `pdf`, all page routes
(`React.lazy` + `retryImport`).

Remaining follow-up (tracked): fully defer `stream-chat` off the trip-page
module graph. It is statically reachable from `useTripMembers`, `useTripTasks`,
`useTripPolls`, `mediaService`, `tripService`, `calendarService`, and
`JoinTrip` via `streamMembershipCoordinator`/`systemMessageService`. Deferring
requires converting those call sites to dynamic imports — a multi-file
critical-path change that needs per-flow test coverage (create trip, join,
calendar share, task/poll system messages).
