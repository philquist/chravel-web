#!/bin/bash
# Hook 10: Session baseline recorder (SessionStart)
#
# WHY: stop-test-gate.sh must gate only the changes made *during this session*, not
# pre-existing working-tree WIP that was already dirty at startup. This snapshots the
# session's starting HEAD and the set of files already dirty, keyed by session_id, so
# the Stop gate can subtract them.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo default)"
BASELINE="${TMPDIR:-/tmp}/chravel-session-baseline-${SID}"

{
  git rev-parse HEAD 2>/dev/null || echo "0000000000000000000000000000000000000000"
  { git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u
} > "$BASELINE" 2>/dev/null || true

exit 0
