#!/usr/bin/env node
/**
 * Concierge Tool 5-File Sync Audit
 *
 * Verifies that every AI concierge tool is consistently registered across the
 * five surfaces it must touch. Drift between any two surfaces causes silent
 * failures in production (tool works in text but not voice, confirms produce
 * no data, etc. — see agent_memory.jsonl entries #25, #26).
 *
 * The five surfaces:
 *  1. ALL_TOOL_DECLARATIONS  in supabase/functions/_shared/concierge/toolRegistry.ts
 *  2. QUERY_CLASS_TOOLS      in the same file (conditional loading map)
 *  3. MUTATING_TOOL_NAMES    in the same file (gates confirmation UX)
 *  4. switch in functionExecutor.ts (every tool needs a handler)
 *  5. switch in src/hooks/usePendingActions.ts (every pending-buffer tool needs
 *     a confirm-handler case)
 *
 * Checks:
 *   A. Every declared tool has an executor case.
 *   B. Every executor case has a declaration (no orphan handlers).
 *   C. Every declared tool is loadable by at least one query class.
 *   D. Every name in MUTATING_TOOL_NAMES is declared.
 *   E. Every tool whose executor body inserts into `trip_pending_actions`
 *      has a case in usePendingActions.ts confirm switch.
 *   F. Every tool referenced in QUERY_CLASS_TOOLS is declared (no typos).
 *   G. Every tool in usePendingActions switch is declared.
 *
 * Usage:
 *   npx tsx scripts/audit-concierge-tools.ts
 *   npx tsx scripts/audit-concierge-tools.ts --json    # machine-readable
 *
 * Exit codes:
 *   0 = all surfaces in sync
 *   1 = drift detected (CI should fail)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const TOOL_REGISTRY = path.join(ROOT, 'supabase/functions/_shared/concierge/toolRegistry.ts');
const EXECUTOR = path.join(ROOT, 'supabase/functions/_shared/functionExecutor.ts');
const PENDING_HOOK = path.join(ROOT, 'src/hooks/usePendingActions.ts');

const JSON_MODE = process.argv.includes('--json');

/**
 * Tools that intentionally write to trip_pending_actions but DO NOT route
 * through the generic usePendingActions confirm switch — they have dedicated
 * confirmation UI elsewhere. Adding a tool here is a deliberate declaration
 * that drift is expected; the script will not fail Check E for these.
 */
const PENDING_CUSTOM_CONFIRM_FLOW = new Set<string>([
  // Bulk delete uses BulkDeleteConfirmCard via onBulkDeleteConfirm /
  // handleBulkDeleteConfirm in src/components/AIConciergeChat.tsx, which calls
  // execute-concierge-tool with the preview token directly.
  'bulkDeleteCalendarEvents',
]);

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function readOrDie(p: string): string {
  if (!fs.existsSync(p)) {
    console.error(`audit-concierge-tools: required file missing: ${p}`);
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8');
}

/**
 * Extract the body between `export const ALL_TOOL_DECLARATIONS: ToolDeclaration[] = [`
 * and the matching closing `];`, then collect every top-level `name: '...'`.
 * Property-key `name:` lines inside nested `properties: { name: { ... } }`
 * are ignored by counting brace depth from the array start.
 */
function parseDeclarations(src: string): string[] {
  const startMatch = src.match(/export const ALL_TOOL_DECLARATIONS[^=]*=\s*\[/);
  if (!startMatch) throw new Error('ALL_TOOL_DECLARATIONS array not found');
  const start = startMatch.index! + startMatch[0].length;

  // Walk forward tracking bracket depth; collect `name:` only at top-of-object
  // level (depth === 1 = direct child of the array's object literal).
  const names: string[] = [];
  let depth = 1; // we're inside the array
  let objectDepth = 0; // depth from the start of the current array element
  let i = start;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '[' || ch === '{') {
      if (ch === '{' && depth === 1) objectDepth = 1;
      else if (objectDepth > 0) objectDepth++;
      depth++;
    } else if (ch === ']' || ch === '}') {
      if (ch === '}' && objectDepth === 1) objectDepth = 0;
      else if (objectDepth > 0) objectDepth--;
      depth--;
    } else if (
      objectDepth === 1 &&
      ch === 'n' &&
      src.startsWith('name:', i) &&
      /[\s,{]/.test(src[i - 1] ?? '')
    ) {
      const m = src.slice(i).match(/^name:\s*['"]([^'"]+)['"]/);
      if (m) names.push(m[1]);
    }
    i++;
  }
  return names;
}

function parseStringSet(src: string, name: string): Set<string> {
  // Matches both `export const NAME = new Set<T>([...])` and bare `const NAME = new Set([...])`.
  const re = new RegExp(
    `(?:export\\s+)?const ${name}\\s*=\\s*new Set(?:<[^>]*>)?\\(\\[([\\s\\S]*?)\\]\\)`,
  );
  const m = src.match(re);
  if (!m) throw new Error(`${name} Set not found`);
  return new Set(Array.from(m[1].matchAll(/['"]([^'"]+)['"]/g), x => x[1]));
}

function parseQueryClassTools(src: string): {
  perClass: Record<string, string[] | 'all'>;
  allReferenced: Set<string>;
} {
  const start = src.indexOf('const QUERY_CLASS_TOOLS');
  if (start < 0) throw new Error('QUERY_CLASS_TOOLS not found');
  const open = src.indexOf('{', start);
  let depth = 1;
  let i = open + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const body = src.slice(open + 1, i - 1);

  // Match `class: [..]` or `class: 'all'`
  const perClass: Record<string, string[] | 'all'> = {};
  const allReferenced = new Set<string>();
  const lines = body.split('\n');
  let currentClass: string | null = null;
  let buffer = '';
  for (const line of lines) {
    const allMatch = line.match(/^\s*([a-z_]+):\s*['"]all['"]/i);
    if (allMatch) {
      perClass[allMatch[1]] = 'all';
      currentClass = null;
      buffer = '';
      continue;
    }
    const startArr = line.match(/^\s*([a-z_]+):\s*\[/i);
    if (startArr) {
      currentClass = startArr[1];
      buffer = line.slice(line.indexOf('[') + 1);
      if (buffer.includes(']')) {
        const arr = Array.from(buffer.matchAll(/['"]([^'"]+)['"]/g), x => x[1]);
        perClass[currentClass] = arr;
        arr.forEach(t => allReferenced.add(t));
        currentClass = null;
        buffer = '';
      }
      continue;
    }
    if (currentClass) {
      buffer += line;
      if (line.includes(']')) {
        const arr = Array.from(buffer.matchAll(/['"]([^'"]+)['"]/g), x => x[1]);
        perClass[currentClass] = arr;
        arr.forEach(t => allReferenced.add(t));
        currentClass = null;
        buffer = '';
      }
    }
  }
  return { perClass, allReferenced };
}

/**
 * Extract `case '<name>':` from the top-level switch in functionExecutor.ts.
 * Multiple unrelated switches in the file would be a false-positive risk, but
 * this codebase has a single `switch (functionName)` driving the dispatch.
 */
function parseExecutorCases(src: string): {
  cases: string[];
  pendingWritingTools: Set<string>;
} {
  const switchIdx = src.indexOf('switch (functionName)');
  if (switchIdx < 0) throw new Error('switch (functionName) not found in functionExecutor.ts');
  const body = src.slice(switchIdx);

  // Walk per-case blocks. A block "writes a pending action" if it both
  // references the `trip_pending_actions` table AND calls `.insert(`. We then
  // extract the literal `tool_name: '<X>'` from the insert payload — that's the
  // tool name that will surface to the usePendingActions confirm switch, which
  // is not necessarily the case name (e.g., splitTaskAssignments writes rows
  // with tool_name='createTask').
  const cases: string[] = [];
  const pendingWritingTools = new Set<string>();
  const caseRe = /case\s+['"]([^'"]+)['"]\s*:/g;
  const matches: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(body)) !== null) {
    matches.push({ name: m[1], index: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    cases.push(matches[i].name);
    const blockStart = matches[i].index;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const block = body.slice(blockStart, blockEnd);

    // Find each `.from('trip_pending_actions')` and check whether the nearby
    // call chain contains `.insert(`. We bound the lookahead to the next 800
    // characters which comfortably covers a builder chain without crossing
    // into a sibling statement.
    const fromRe = /\.from\(\s*['"]trip_pending_actions['"]\s*\)/g;
    let fm: RegExpExecArray | null;
    while ((fm = fromRe.exec(block)) !== null) {
      const window = block.slice(fm.index, fm.index + 800);
      if (!window.includes('.insert(')) continue;
      // Find the tool_name literal inside the insert payload.
      const toolNameMatch = window.match(/tool_name\s*:\s*['"]([^'"]+)['"]/);
      pendingWritingTools.add(toolNameMatch ? toolNameMatch[1] : matches[i].name);
    }
  }
  return { cases, pendingWritingTools };
}

/**
 * usePendingActions has two switches (one for execute, one for label/refresh).
 * We collect cases from BOTH and report a tool as "handled" if it appears in
 * either, since both need to know about the tool.
 */
function parsePendingActionCases(src: string): {
  executeCases: Set<string>;
  refreshCases: Set<string>;
} {
  const indices: number[] = [];
  const re = /switch\s*\(\s*action\.tool_name\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) indices.push(m.index);
  if (indices.length === 0) throw new Error('switch(action.tool_name) not found');

  const grab = (start: number, end: number): Set<string> => {
    const slice = src.slice(start, end);
    return new Set(Array.from(slice.matchAll(/case\s+['"]([^'"]+)['"]/g), x => x[1]));
  };

  const first = indices[0];
  const second = indices[1] ?? src.length;
  const firstEnd = indices[1] ?? src.length;
  return {
    executeCases: grab(first, firstEnd),
    refreshCases: indices[1] != null ? grab(second, src.length) : new Set(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Finding {
  check: string;
  severity: 'error' | 'warn';
  tools: string[];
  message: string;
}

function main(): number {
  const registrySrc = readOrDie(TOOL_REGISTRY);
  const executorSrc = readOrDie(EXECUTOR);
  const pendingSrc = readOrDie(PENDING_HOOK);

  const declarations = parseDeclarations(registrySrc);
  const declSet = new Set(declarations);
  const mutating = parseStringSet(registrySrc, 'MUTATING_TOOL_NAMES');
  const { perClass, allReferenced } = parseQueryClassTools(registrySrc);
  const universal = parseStringSet(registrySrc, 'UNIVERSAL_TOOL_NAMES');
  const { cases: executorCases, pendingWritingTools } = parseExecutorCases(executorSrc);
  const executorSet = new Set(executorCases);
  const pending = parsePendingActionCases(pendingSrc);

  const hasAll = Object.values(perClass).some(v => v === 'all');
  const findings: Finding[] = [];

  // A. Every declared tool has an executor case.
  const noExecutor = declarations.filter(t => !executorSet.has(t));
  if (noExecutor.length) {
    findings.push({
      check: 'A',
      severity: 'error',
      tools: noExecutor,
      message: 'Declared tools missing an executor case in functionExecutor.ts',
    });
  }

  // B. Every executor case has a declaration.
  const noDecl = executorCases.filter(t => !declSet.has(t));
  if (noDecl.length) {
    findings.push({
      check: 'B',
      severity: 'error',
      tools: noDecl,
      message: 'Executor handlers with no matching declaration (dead code or rename)',
    });
  }

  // C. Every declared tool is loadable by at least one query class.
  if (!hasAll) {
    const notLoadable = declarations.filter(t => !allReferenced.has(t) && !universal.has(t));
    if (notLoadable.length) {
      findings.push({
        check: 'C',
        severity: 'error',
        tools: notLoadable,
        message: 'Declared tools that no query class can load (unreachable by classifier)',
      });
    }
  }

  // D. Every name in MUTATING_TOOL_NAMES is declared.
  const unknownMutating = Array.from(mutating).filter(t => !declSet.has(t));
  if (unknownMutating.length) {
    findings.push({
      check: 'D',
      severity: 'error',
      tools: unknownMutating,
      message: 'MUTATING_TOOL_NAMES entries that are not declared tools',
    });
  }

  // E. Every executor case that writes to trip_pending_actions must have a
  //    case in usePendingActions execute switch (unless it has a documented
  //    custom confirm flow).
  const pendingNotHandled = Array.from(pendingWritingTools).filter(
    t => !pending.executeCases.has(t) && !PENDING_CUSTOM_CONFIRM_FLOW.has(t),
  );
  if (pendingNotHandled.length) {
    findings.push({
      check: 'E',
      severity: 'error',
      tools: pendingNotHandled,
      message:
        'Tools that write to trip_pending_actions but have no confirm case in usePendingActions.ts (confirm card will silently no-op)',
    });
  }

  // F. Every tool name referenced in QUERY_CLASS_TOOLS is declared.
  const typoInClasses = Array.from(allReferenced).filter(t => !declSet.has(t));
  if (typoInClasses.length) {
    findings.push({
      check: 'F',
      severity: 'error',
      tools: typoInClasses,
      message: 'QUERY_CLASS_TOOLS references tool names that are not declared (typo)',
    });
  }

  // G. Every case in usePendingActions must be a declared tool.
  const pendingOrphans = Array.from(pending.executeCases).filter(t => !declSet.has(t));
  if (pendingOrphans.length) {
    findings.push({
      check: 'G',
      severity: 'warn',
      tools: pendingOrphans,
      message: 'usePendingActions has cases for tools that are not declared (orphan handler)',
    });
  }

  // ── Output ────────────────────────────────────────────────────────────────
  const summary = {
    declarations: declarations.length,
    executorCases: executorCases.length,
    mutating: mutating.size,
    queryClasses: Object.keys(perClass).length,
    pendingWritingTools: pendingWritingTools.size,
    pendingExecuteCases: pending.executeCases.size,
    findings: findings.length,
  };

  if (JSON_MODE) {
    console.log(JSON.stringify({ summary, findings }, null, 2));
  } else {
    console.log('Concierge Tool 5-File Sync Audit');
    console.log('================================');
    console.log(`Declarations:           ${summary.declarations}`);
    console.log(`Executor cases:         ${summary.executorCases}`);
    console.log(`Mutating tools:         ${summary.mutating}`);
    console.log(`Query classes:          ${summary.queryClasses}`);
    console.log(`Pending-writing tools:  ${summary.pendingWritingTools}`);
    console.log(`Pending confirm cases:  ${summary.pendingExecuteCases}`);
    console.log();
    if (findings.length === 0) {
      console.log('OK — all five surfaces in sync.');
    } else {
      for (const f of findings) {
        const icon = f.severity === 'error' ? 'FAIL' : 'WARN';
        console.log(`[${icon}] Check ${f.check}: ${f.message}`);
        for (const t of f.tools) console.log(`        - ${t}`);
        console.log();
      }
    }
  }

  return findings.some(f => f.severity === 'error') ? 1 : 0;
}

process.exit(main());
