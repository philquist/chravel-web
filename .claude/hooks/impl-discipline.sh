#!/bin/bash
# Hook 8: Implementation discipline injector (UserPromptSubmit)
#
# WHY: CLAUDE.md mandates a Bug-Fix Protocol (Reproduce -> Diagnose -> Fix -> Prove)
# and "search for an existing utility before writing new code", but as prose it is
# easy to skip. This surfaces those rules *at decision time* for implementation-style
# prompts. Pure context injection (stdout on exit 0) — it can never block or loop.
#
# MATCHING: fires only when the prompt *starts* with an implementation imperative
# (after optional polite lead-ins). Anchoring to the start avoids false positives on
# notifications/questions that merely contain words like "created" or "change"
# (e.g. "A pull request was just created ...").

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
PROMPT="$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || echo "")"
[[ -z "$PROMPT" ]] && exit 0

LEADIN='(please|pls|kindly|now|then|next|also|and|ok|okay|go ahead( and)?|lets|let'"'"'s|can you|could you|would you|will you|i want( you)? to|i'"'"'d like( you)? to|i need( you)? to|help me( to)?)'
VERB='(fix|add|implement|refactor|build|rebuild|change|wire( up)?|create|update|upgrade|migrate|debug|rebase|apply|remove|delete|drop|rename|move|write|set up|enable|disable|integrate|install|configure|make|patch|adjust|modify|replace)'

if printf '%s' "$PROMPT" | grep -qiE "^[[:space:]]*(${LEADIN}[[:space:]]+)*${VERB}\b"; then
  cat <<'REMINDER'
[impl-discipline] Before writing code:
- Bug-Fix Protocol: Reproduce -> Diagnose (root cause) -> Fix (smallest correct change) -> Prove (test) -> Report.
- Search for an existing utility/hook/pattern first — prefer reuse over a new implementation (see CLAUDE.md).
- Run the actual behavior or the related tests before declaring done; typecheck-clean is not proof of correctness.
- Critical path (Auth/Trips/Chat/Payments/Concierge): guard against Trip Not Found, auth desync, RLS leaks.
REMINDER
fi
exit 0
