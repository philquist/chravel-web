#!/bin/bash
# Hook 8: Implementation discipline injector (UserPromptSubmit)
#
# WHY: CLAUDE.md mandates a Bug-Fix Protocol (Reproduce -> Diagnose -> Fix -> Prove)
# and "search for an existing utility before writing new code", but as prose it is
# easy to skip. This surfaces those rules *at decision time* for implementation-style
# prompts. Pure context injection (stdout on exit 0) — it can never block or loop.

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
PROMPT="$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")"

if [[ -z "$PROMPT" ]]; then
  exit 0
fi

# Only inject for implementation intent — leave questions / research untouched.
if printf '%s' "$PROMPT" \
  | grep -qiE '\b(fix|add|implement|refactor|build|change|wire|create|update|migrate|debug)\b'; then
  cat <<'REMINDER'
[impl-discipline] Before writing code:
- Bug-Fix Protocol: Reproduce -> Diagnose (root cause) -> Fix (smallest correct change) -> Prove (test) -> Report.
- Search for an existing utility/hook/pattern first — prefer reuse over a new implementation (see CLAUDE.md).
- Run the actual behavior or the related tests before declaring done; typecheck-clean is not proof of correctness.
- Critical path (Auth/Trips/Chat/Payments/Concierge): guard against Trip Not Found, auth desync, RLS leaks.
REMINDER
fi

exit 0
