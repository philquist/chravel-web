#!/bin/bash
# Hook 9: Pre-push review reminder (PreToolUse on Bash)
#
# WHY: logic/semantic errors historically escape at `git push` -> branch -> a second
# model cleans them up after the fact. typecheck/lint/Stop-test-gate catch mechanical
# and test failures, but not "right types, wrong behavior". This intercepts the FIRST
# push of a session and asks for a semantic review (/code-review) at that escape point.
#
# DESIGN (loop-safe, non-nagging):
#   - Fires ONLY on a real `git push` invocation — at command start or after a
#     separator (; && |). It must NOT match "git push" appearing inside a quoted
#     commit message or heredoc body (preceded by an ordinary space), which would
#     wrongly block `git commit -m "...git push..."`.
#   - Blocks the FIRST push per session (exit 2 -> stderr fed to Claude), then drops a
#     per-session sentinel so subsequent pushes flow freely.

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")"

# A real push: line start OR after a command separator, then `git push`, then a
# word boundary. Anchoring on (^|[;&|]) avoids matching "git push" inside prose.
if ! printf '%s' "$COMMAND" | grep -qE '(^|[;&|])[[:space:]]*git[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi
# Ignore help/dry-run invocations.
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]].*(--help|--dry-run)'; then
  exit 0
fi

SENTINEL="${TMPDIR:-/tmp}/chravel-review-reminded-${SESSION_ID}"
if [[ -f "$SENTINEL" ]]; then
  exit 0
fi
touch "$SENTINEL" 2>/dev/null || true

{
  echo "PRE-PUSH REVIEW GATE (one-time this session):"
  echo ""
  echo "Run a semantic review on your branch diff before pushing — this is the point"
  echo "where logic errors (right types, wrong behavior) have historically escaped to"
  echo "post-merge cleanup. typecheck/tests do not catch this class."
  echo ""
  echo "  /code-review          (report findings)"
  echo "  /code-review --fix    (apply the fixes)"
  echo ""
  echo "Address anything it surfaces, then re-run the push to proceed."
} >&2
exit 2
