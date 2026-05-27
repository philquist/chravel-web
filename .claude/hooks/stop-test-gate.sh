#!/bin/bash
# Hook 7: Stop gate — run related tests before the agent yields a turn (Stop)
#
# WHY: typecheck runs on every edit, but tests never run locally until CI or PR
# creation. Logic errors (right types, wrong behavior) sail through to push, then
# get cleaned up by a second model after the fact. This gate runs the vitest tests
# *related* to changed frontend files at end-of-turn so the agent sees failures —
# and the missing-test reminder nudges reproduce-first discipline.
#
# DESIGN (loop-safe + env-robust):
#   - Only frontend src/** .ts/.tsx changes trigger it (vitest doesn't cover Deno
#     edge functions; those use their own infra).
#   - It blocks AT MOST ONCE per stop cycle, guarded by stop_hook_active. The first
#     stop attempt blocks (exit 2) with the test output / reminder; the agent
#     addresses it; the next attempt is allowed. This avoids a permanent lock when
#     failures are environmental (missing VITE_ secrets locally — see
#     pre-pr-tests.sh), while still forcing the agent to look at results once.
#   - Hard pass (tests green, test file present) -> allow silently.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat 2>/dev/null || true)"
STOP_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"

# Already nudged once this cycle — don't loop. Allow the stop.
if [[ "$STOP_ACTIVE" == "true" ]]; then
  exit 0
fi

# Accumulated working-tree changes (staged + unstaged), frontend source only.
CHANGED="$( { git diff --name-only; git diff --cached --name-only; } 2>/dev/null \
  | sort -u \
  | grep -E '^src/.*\.(ts|tsx)$' || true )"

# No frontend code touched — nothing to gate (pure Q&A / research / edge-fn work).
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

# Did the change set include any test file? (reproduce-first signal)
TEST_TOUCHED="$(printf '%s\n' "${EXISTING[@]}" \
  | grep -E '(\.test\.|\.spec\.|/__tests__/)' || true)"

# Run vitest only on tests related to the changed source files.
# --passWithNoTests: untested files must not hard-fail here (the reminder handles that).
TEST_OUT="$(npx vitest related --run --passWithNoTests "${EXISTING[@]}" 2>&1)"
TEST_EXIT=$?

if [[ $TEST_EXIT -ne 0 ]]; then
  {
    echo "STOP GATE: related tests for your changed files did not pass."
    echo ""
    echo "$TEST_OUT" | tail -40
    echo ""
    echo "Before finishing: if these are real failures, fix them. If they are"
    echo "environmental (missing VITE_ secrets locally — see .claude/hooks/pre-pr-tests.sh),"
    echo "confirm that is the cause, then you may stop again to proceed."
  } >&2
  exit 2
fi

# Tests pass (or none matched). If code changed but no test was added/updated,
# enforce the Bug-Fix Protocol's reproduce/prove step with a one-shot reminder.
if [[ -z "$TEST_TOUCHED" ]]; then
  {
    echo "STOP GATE: you changed frontend code but no test file (*.test.*, *.spec.*,"
    echo "__tests__/) was added or updated this session."
    echo ""
    echo "Per CLAUDE.md Bug-Fix Protocol (Reproduce -> Diagnose -> Fix -> Prove): add a"
    echo "reproduction or coverage test that fails for the real reason, OR state in one"
    echo "line why no test is warranted (e.g. pure styling/copy change). Then stop again."
  } >&2
  exit 2
fi

exit 0
