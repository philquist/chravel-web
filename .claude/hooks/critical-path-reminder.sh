#!/bin/bash
# Hook 11: Critical-path edit reminder (PreToolUse on Edit|Write)
#
# WHY: replaces a flaky `prompt`-type hook that surfaced its reasoning as an abort and
# blocked *non-critical* edits (e.g. CLAUDE.md) instead of approving silently. This is
# deterministic: non-critical files pass instantly (exit 0); genuine critical-path
# files get ONE reminder per session (exit 2 -> stderr to Claude), then flow freely.
# It is a reminder heuristic, not a security gate — RLS/auth are enforced server-side.

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo default)"
[[ -z "$FILE" ]] && exit 0

# Critical-path file patterns: auth, trip loading, supabase client, RLS, payments, guards.
if ! printf '%s' "$FILE" | grep -qE '(useAuth|useTrip|integrations/supabase/client|AuthGuard|RequireAuth|ProtectedRoute|requireAuth|usePayment|useSubscription|useEntitlement|usePaywall|[Rr]evenue[Cc]at|src/pages/.*[Tt]rip|supabase/migrations/.*\.sql)'; then
  exit 0
fi

# One reminder per session per file, then get out of the way.
SAFE="$(printf '%s' "$FILE" | tr -c 'A-Za-z0-9' '_')"
SENTINEL="${TMPDIR:-/tmp}/chravel-critpath-${SID}-${SAFE}"
[[ -f "$SENTINEL" ]] && exit 0
touch "$SENTINEL" 2>/dev/null || true

{
  echo "CRITICAL-PATH FILE: $FILE"
  echo ""
  echo "Verify this change cannot cause: Trip Not Found, auth desync (gate fetches on"
  echo "hydrated auth), RLS leaks (existence != membership/access), or payment-state"
  echo "drift. The chravel-no-regressions skill covers these checks. Re-issue to proceed."
} >&2
exit 2
