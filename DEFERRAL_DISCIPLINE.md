# Deferral Discipline — No Lazy Tech Debt

> **Headline rule:** If you see something, say something — then plan to do something.

This guide is the canonical rulebook for how Chravel engineers (human or agent) handle adjacent issues discovered while working on a task. It exists to stop quiet tech-debt accumulation, drive-by parking-lot notes, and "out of scope" hand-waves that compound into platform fragility.

It applies to every coding task, audit, bug fix, refactor, and review.

---

## 1. The Two Choices

When you discover a related defect, fragile mapping, blocked hook, missing dependency, weak RLS policy, dead code, broken mobile config, missing migration, missing test coverage, or regression risk, do **one** of the following:

1. **Fix in current branch** — required if it's directly connected to the bug, affects correctness, creates duplicate logic, or is needed for feature reliability.
2. **Produce a paste-ready Follow-Up Issue Plan** — never a vague parking-lot note.

There is no third option. "I noticed it" without an artifact is not acceptable.

---

## 2. Banned Phrases

The following phrases are prohibited in PR descriptions, code comments, commit messages, and agent responses:

- `out of scope`
- `future cleanup PR`
- `temporary duplication`
- `known tech debt`
- `could be addressed later`
- `not addressed in this branch`

If you would have written one of these, you owe either a fix or a Follow-Up Issue Plan instead.

---

## 3. Follow-Up Issue Plan Template

Every deferred item produces a paste-ready issue plan with all of the following sections filled in. No template field is optional.

- **Title**
- **Why this matters**
- **Files likely involved**
- **Current risk**
- **Recommended fix**
- **Acceptance criteria**
- **Test plan**
- **Rollback plan**
- **Launch-blocking?** (yes/no + reasoning)

The output must be ready to paste into GitHub Issues without further editing.

---

## 4. Duplicate Logic Carve-Out

Temporary duplication is acceptable **only when all four conditions are true**:

1. Removing it creates high regression risk.
2. The duplicate path is explicitly marked in code (comment + TODO with issue link).
3. A concrete cleanup issue is produced (using the template above).
4. The user has approved the deferral.

Otherwise: consolidate to one source of truth. Mapping layers are not a fix — they are a smell. Fix at the source.

---

## 5. Blocked-Path Protocol

If a tool, hook, permission, linter, test, import rule, or repo access blocks the ideal fix:

1. Identify the exact blocker.
2. Explain why it blocks the preferred fix.
3. Try **at least two** alternative approaches.
4. Choose the safest viable path.
5. If no path is safe, produce a ready-to-run unblock plan.

"It didn't work" is not a blocker report. The blocker report names the rule, the line, the permission, or the policy that prevented the fix.

---

## 6. Critical-Path Override

For **auth, chat, media uploads, record creation/editing, payments, invites, and mobile wrapper behavior**: reliability beats narrow scope.

If the feature remains fragile after the fix, say so directly and propose the next fix in the same response. Do not ship a critical-path change that you know is still fragile without flagging it explicitly.

This override exists because Chravel's zero-tolerance regressions (Trip Not Found, auth desync, RLS leaks, payment state drift) all live on these paths.

---

## 7. Mandatory Response Footer

Every final response on a coding task ends with the following seven-section footer. No exceptions.

1. **Fixed now**
2. **Discovered**
3. **Intentionally deferred** (if anything)
4. **Why deferral was necessary**
5. **Paste-ready follow-up prompt** for each deferred item
6. **Validation completed**
7. **Remaining launch blockers**

If nothing was deferred, sections 3–5 say "None." Do not omit the headers.

---

## 8. How This Connects to Other Chravel Guides

- **`CLAUDE.md` § BUG-FIX PROTOCOL** — Reproduce → Diagnose → Fix → Prove. Deferral discipline applies after the bug itself is fixed: anything you saw along the way still needs Section 1 above.
- **`CLAUDE.md` § AGENT LEARNING PROTOCOL** — When a deferred item turns out to be a recurring pattern, capture it in `DEBUG_PATTERNS.md` or `LESSONS.md` as part of the branch's batched learning commit.
- **`AGENTS.md` § NON-NEGOTIABLES** — "One source of truth" and "No regressions" are upstream of this guide. Deferral discipline is the operational rule that enforces them when work crosses module boundaries.
- **Zero-tolerance paths** — Trip Not Found regressions, auth desync, and RLS leaks always trigger the Critical-Path Override.

---

## 9. Quick Reference Card

```
SAW A PROBLEM ADJACENT TO MY TASK?
  ├── Directly connected / correctness / duplicate logic / reliability?
  │     → FIX IN CURRENT BRANCH
  └── Genuinely separable?
        → PRODUCE FOLLOW-UP ISSUE PLAN (all 9 fields)
        → NEVER write "out of scope" — write the plan instead

CRITICAL PATH (auth/chat/media/payments/invites/mobile)?
  → RELIABILITY BEATS SCOPE. Say so. Propose next fix in same response.

BLOCKED?
  → Name the blocker. Try ≥2 alternatives. Pick safest. If none safe, ship unblock plan.

ENDING A RESPONSE?
  → Always include the 7-section footer.
```

---

_Last Updated: 2026-05-10 · Owner: Chravel Engineering · See also: `CLAUDE.md`, `AGENTS.md`, `DEBUG_PATTERNS.md`, `LESSONS.md`_
