#!/bin/bash
# Hook 9: Pre-push review reminder (PreToolUse on Bash)
#
# WHY: logic/semantic errors historically escape at `git push` -> branch -> a second
# model cleans them up after the fact. typecheck/lint/Stop-test-gate catch mechanical
# and test failures, but not "right types, wrong behavior". This intercepts the FIRST
# push of a session and asks for a semantic review (/code-review) at that escape point.
#
# DESIGN (loop-safe, non-nagging):
#   - Detects a real `git push` command by first reducing the command to a code
#     "skeleton" (heredoc + quoted-string bodies stripped), then matching `git push`
#     as a command token. So "git push" inside a commit message — e.g.
#     `git commit -m "fix; git push later"` — is NOT matched, while a push inside a
#     retry loop (`until git push; do ...; done`) still is.
#   - Blocks the FIRST push per session (exit 2 -> stderr fed to Claude), then drops a
#     per-session sentinel so subsequent pushes flow freely.

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")"

# Reduce the command to a code "skeleton": collapse to one line, drop heredoc bodies
# (everything after a `<<TAG` marker), then strip single/double-quoted string bodies.
# This removes the false-positive vector where `git push` appears inside a quoted
# commit message, echo string, or heredoc — e.g. `git commit -m "fix; git push later"`.
SKELETON="$(printf '%s' "$COMMAND" | tr '\n' ' ' \
  | sed "s/<<[[:space:]]*['\"]\{0,1\}[A-Za-z_][A-Za-z0-9_]*.*//" \
  | sed "s/'[^']*'//g" \
  | sed 's/"[^"]*"//g')"

# In the cleaned skeleton, `git push` preceded by start or any non-word char (space,
# separator, subshell paren, loop keyword) and followed by whitespace/end is a real push.
if ! printf '%s' "$SKELETON" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+push([[:space:];&|)]|$)'; then
  exit 0
fi
# Ignore help/dry-run invocations.
if printf '%s' "$SKELETON" | grep -qE 'git[[:space:]]+push[[:space:]].*(--help|--dry-run)'; then
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
