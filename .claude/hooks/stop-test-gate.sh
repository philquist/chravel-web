#!/bin/bash
# Hook 7: Stop gate — run related tests before the agent yields a turn (Stop)
#
# WHY: typecheck runs on every edit, but tests never run locally until CI or PR
# creation. Logic errors (right types, wrong behavior) sail through to push, then
# get cleaned up by a second model after the fact. This gate runs the vitest tests
# *related* to the frontend files changed THIS SESSION at end-of-turn so the agent
# sees failures — and the missing-test reminder nudges reproduce-first discipline.
#
# SCOPE: only files changed during this session (committed-since-baseline + currently
# uncommitted) MINUS files already dirty at session start. The baseline is recorded by
# session-baseline.sh (SessionStart). Without a baseline (e.g. pre-existing sessions),
# it falls back to currently-uncommitted changes only.
#
# DESIGN (loop-safe + env-robust):
#   - Only frontend src/** .ts/.tsx changes trigger it (vitest doesn't cover Deno
#     edge functions; those use their own infra).
#   - Blocks AT MOST ONCE per stop cycle, guarded by stop_hook_active, so an
#     environmental failure (missing VITE_ secrets locally) can't lock the loop.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat 2>/dev/null || true)"
STOP_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo default)"

# Already nudged once this cycle — don't loop. Allow the stop.
if [[ "$STOP_ACTIVE" == "true" ]]; then
  exit 0
fi

src_filter() { grep -E '^src/.*\.(ts|tsx)$' || true; }
uncommitted() { { git diff --name-only; git diff --cached --name-only; } 2>/dev/null; }

BASELINE="${TMPDIR:-/tmp}/chravel-session-baseline-${SID}"

if [[ -f "$BASELINE" ]]; then
  BASE_HEAD="$(head -n1 "$BASELINE" 2>/dev/null)"
  # Session changes = (uncommitted ∪ committed-since-baseline) − files already dirty at start.
  CHANGED="$( {
      uncommitted
      # Attribute committed changes only while BASE_HEAD is still an ancestor of HEAD.
      # A rebase/amend rewrites SHAs and orphans BASE_HEAD; diffing it then surfaces
      # unrelated commits (e.g. main's, pulled in by a rebase) as false session changes.
      [[ -n "$BASE_HEAD" ]] && git merge-base --is-ancestor "$BASE_HEAD" HEAD 2>/dev/null \
        && git diff --name-only "$BASE_HEAD" HEAD 2>/dev/null
    } | sort -u | src_filter \
      | { grep -vxF -f <(tail -n +2 "$BASELINE" 2>/dev/null | sort -u) 2>/dev/null || cat; } )"
else
  # No baseline (session predates this hook) — fall back to uncommitted only.
  CHANGED="$( uncommitted | sort -u | src_filter )"
fi

# No session frontend code touched — nothing to gate.
if [[ -z "$CHANGED" ]]; then
  exit 0
fi

# Keep only files that still exist (ignore deletions).
EXISTING=()
while IFS= read -r f; do
  [[ -n "$f" && -f "$f" ]] && EXISTING+=("$f")
done <<< "$CHANGED"

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  exit 0
fi

# Did the session change set include any test file? (reproduce-first signal)
TEST_TOUCHED="$(printf '%s\n' "${EXISTING[@]}" | grep -E '(\.test\.|\.spec\.|/__tests__/)' || true)"

# Run vitest only on tests related to the changed source files.
TEST_OUT="$(npx vitest related --run --passWithNoTests "${EXISTING[@]}" 2>&1)"
TEST_EXIT=$?

if [[ $TEST_EXIT -ne 0 ]]; then
  {
    echo "STOP GATE: related tests for files you changed this session did not pass."
    echo ""
    echo "$TEST_OUT" | tail -40
    echo ""
    echo "Before finishing: if these are real failures, fix them. If they are"
    echo "environmental (missing VITE_ secrets locally — see .claude/hooks/pre-pr-tests.sh),"
    echo "confirm that is the cause, then you may stop again to proceed."
  } >&2
  exit 2
fi

if [[ -z "$TEST_TOUCHED" ]]; then
  {
    echo "STOP GATE: you changed frontend code this session but no test file (*.test.*,"
    echo "*.spec.*, __tests__/) was added or updated."
    echo ""
    echo "Per CLAUDE.md Bug-Fix Protocol (Reproduce -> Diagnose -> Fix -> Prove): add a"
    echo "reproduction or coverage test that fails for the real reason, OR state in one"
    echo "line why no test is warranted (e.g. pure styling/copy change). Then stop again."
  } >&2
  exit 2
fi

exit 0
