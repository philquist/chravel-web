## Goal
Make `fetch-og-metadata` robust against URLs pasted with HTML entities, surrounding quotes, or markdown link syntax — before SSRF validation runs.

## Change
Extend the existing `sanitizeUrl` helper in `supabase/functions/fetch-og-metadata/index.ts` (currently lines 45–60) so it normalizes the URL in this order:

1. **Trim whitespace.**
2. **Unwrap markdown link syntax** — if the input matches `[text](url)` or `<url>`, extract the inner URL.
3. **Strip surrounding quotes/brackets** — leading/trailing `"`, `'`, `` ` ``, `«»`, `'…'`, `"…"`, `(`, `[`, `{`.
4. **Decode HTML entities** — `&amp;` → `&`, `&#38;` → `&`, `&#x26;` → `&`, plus `&lt; &gt; &quot; &#39; &nbsp;`. Use a small entity map + numeric (`&#nnn;` / `&#xhh;`) decoder. No new deps.
5. **Strip trailing punctuation** (existing logic): `.,!?;:`.
6. **Strip unmatched trailing closing brackets** (existing logic): `)`, `]`, `}`.
7. Final trailing-punctuation pass (existing).

The sanitized URL is then passed to `validateExternalUrlBeforeFetch` exactly as today — no changes to the SSRF/validation pipeline, redirect handling, or response shape.

## Technical details
- Keep everything inline in `index.ts` (no shared module changes) to keep the diff surgical.
- Order matters: unwrap markdown/quotes **before** entity decode (entities may live inside the URL), and entity decode **before** punctuation stripping (a decoded `&` could expose new trailing chars... but `&` isn't in the punctuation set, so safe).
- Idempotent: running `sanitizeUrl` twice yields the same result.
- No behavior change for already-clean URLs.

## Verification
- Add a Deno test file `supabase/functions/fetch-og-metadata/sanitize_test.ts` covering:
  - `"https://example.com"` (quoted)
  - `[Tour](https://viator.com/x)` (markdown)
  - `<https://example.com>` (angle-wrapped)
  - `https://example.com/?a=1&amp;b=2` (entity)
  - `https://example.com/path).` (existing trailing-punct case still works)
  - Clean URL passthrough
- Run via `supabase--test_edge_functions` for the `fetch-og-metadata` function.
- Deploy via `supabase--deploy_edge_functions`.

## Out of scope
- Client-side `urlUtils.ts` / `stripTrailingPunctuation` — server is the security boundary, fix lives there.
- Changes to SSRF validation, redirect logic, or response contract.
