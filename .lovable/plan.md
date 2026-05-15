What went wrong:
- I only changed two earlier `Index.tsx` render branches.
- The screenshot is coming from a third desktop navigation branch later in the same file, around lines 1208–1232.
- That branch still renders `TripActionBar` first and `TripViewToggle` second, so at desktop widths it continues to show New Trip / Alerts / Settings / Search on the left and My Trips / Pro / Events on the right.

Fix plan:
1. Update the active desktop navigation branch in `src/pages/Index.tsx` so `TripViewToggle` renders first and `TripActionBar` renders second.
2. Preserve all existing props and behavior exactly:
   - My Trips / Pro / Events remain controlled by `TripViewToggle`.
   - New Trip / Alerts / Settings / Search remain controlled by `TripActionBar`.
   - Mobile navigation remains untouched.
3. Verify with a targeted source check that all desktop nav branches in `Index.tsx` now use this order:

```text
LEFT:  TripViewToggle  -> My Trips / Pro / Events
RIGHT: TripActionBar   -> New Trip / Alerts / Settings / Search
```

Files to change:
- `src/pages/Index.tsx` only.

Risk:
- Low. This is a JSX ordering fix only; no state, query, auth, or data behavior changes.