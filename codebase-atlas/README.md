# Chravel — Codebase Architecture Atlas

An interactive, self-contained dashboard that maps the Chravel codebase for **two audiences at once**: a non-technical founder/operator (plain-English summaries, risk levels, business implications) and engineers (file paths, dependencies, quality scores, refactor sequence).

## Open it

```bash
open codebase-atlas/index.html        # macOS
xdg-open codebase-atlas/index.html    # Linux
# or just double-click the file
```

It is fully self-contained — pure HTML/CSS/JS with the data embedded inline. **No server, build step, or network required.** It works straight from `file://`.

## What's inside

| File | Purpose |
|---|---|
| `index.html` | The dashboard. Sticky nav, search/filter, expand/collapse cards, color-coded badges, risk heatmap, module scorecards, dependency tables. |
| `architecture-data.json` | The canonical data model that drives the dashboard (the same object is embedded inline in `index.html`). Edit this to update findings. |
| `README.md` | This file. |

### The 14 sections
1. **Executive Overview** — what the app does, who it serves, top risks / cleanups / missing pieces.
2. **Health Scores** — 7 scores (0–100), each with a written rationale.
3. **System Map** — 16 domains with purpose, key files, deps, risk, quality, next actions.
4. **File Explorer** — the highest-signal files with badges, plain + technical purpose, and a recommended action (searchable; the search box also filters the System Map).
5. **Dependency Graph** — "god files", coupling hubs, and an orphan/unused note.
6. **Feature Map** — features with completeness estimates and missing UI states.
7. **Data Flow Map** — major journeys traced entry → DB, with failure points.
8. **Backend / API / DB** — edge functions, auth assumptions, risks.
9. **External Integrations** — every third-party service + env-var **names** (never values).
10. **Dead / Stale Code** — suspected redundancy with evidence + confidence (analysis only).
11. **Quality Review** — modules graded with fixes to reach 90+.
12. **Missing Pieces** — gaps prioritized by impact.
13. **Refactor Roadmap** — 4 phases, safe-cleanup → scale-readiness.
14. **Founder Glossary** — plain-English term definitions.

## Color & confidence

Green = healthy · Yellow = needs attention · Orange = risky/complex · Red = high-risk/dead · Blue = core infra · Purple = AI/external · Gray = low confidence.

Confidence on every important claim: **High** = directly verified in code · **Medium** = strongly implied by structure/imports · **Low** = needs manual verification.

## How the data was gathered

Evidence-grounded, not generic. Sources:
- **Repo docs:** `SYSTEM_MAP.md` (subsystem topology), `tech_debt_report.md` (debt + bundle ROI), `CLAUDE.md`, `AUDIT_INDEX.md`, `DEBUG_PATTERNS.md`, `LESSONS.md`, `TEST_GAPS.md`.
- **Existing scans:** `knip_output.txt` (dead-code), `BUNDLE_SIZE_BASELINE.md`.
- **Lint contracts:** `eslint.config.js` deprecation rules (e.g. `enhancedTripContextService` → `TripContextAggregator`; Stream chat surfaces banned from legacy `chatService`).
- **Static analysis this session:** file counts, LOC ranking of largest files, directory layout.

### Caveats
- The "unused files" count from knip includes framework entry points it can't resolve (Vercel `api/*`, Remotion compositions, `scripts/*`) — these are **Future/Unclear, not confirmed dead**. Verify per-file before deleting anything.
- No formal cycle scan (madge/dpdm) was run; circular-dependency claims are Low confidence.
- LOC for `AIConciergeChat.tsx` (~2.5k) is taken from `tech_debt_report.md`.

## Regenerate

This artifact is produced by the **`codebase-atlas`** skill (`.claude/skills/codebase-atlas/SKILL.md`). To refresh after the code changes, re-run the skill — it re-harvests the evidence sources above, rewrites `architecture-data.json`, and re-injects it into `index.html`. To tweak findings by hand, edit `architecture-data.json` and re-inject:

```bash
node -e "const fs=require('fs');let h=fs.readFileSync('codebase-atlas/index.html','utf8');const d=fs.readFileSync('codebase-atlas/architecture-data.json','utf8');h=h.replace(/<script id=\"atlas-data\"[^>]*>[\s\S]*?<\/script>/,()=>'<script id=\"atlas-data\" type=\"application/json\">'+d+'</script>');fs.writeFileSync('codebase-atlas/index.html',h);"
```

> Analysis + artifact only. No production code was modified to create this atlas.
