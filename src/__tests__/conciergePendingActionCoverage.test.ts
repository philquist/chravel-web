import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the invariant from agent memory #25: the pending-action confirm handler
 * (`usePendingActions`) must have a case for EVERY tool that the server executor
 * writes to `trip_pending_actions`. A missing case makes the confirm card appear
 * to work while silently producing no data (it falls through to the default throw).
 *
 * This is a static cross-file check so it catches drift the moment a new buffered
 * write tool is added on the server without a matching client confirm case.
 */
const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function parseQuotedNames(source: string, pattern: RegExp): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/**
 * Tools that intentionally resolve through their own dedicated server-side
 * preview/confirm flow rather than the generic `usePendingActions` switch.
 * `bulkDeleteCalendarEvents` writes a preview row that is resolved by the
 * dedicated `bulkDeleteCalendarEvents` executor case (verifies the preview token).
 */
const BESPOKE_CONFIRM_FLOW = new Set<string>(['bulkDeleteCalendarEvents']);

describe('concierge pending-action confirm coverage', () => {
  const executorSource = readRepoFile('supabase/functions/_shared/functionExecutor.ts');
  const pendingSource = readRepoFile('src/hooks/usePendingActions.ts');

  // Every tool_name the executor inserts into trip_pending_actions.
  const writtenPendingTools = parseQuotedNames(executorSource, /tool_name:\s*'([^']+)'/g);
  // Every case handled in usePendingActions (the confirm switch).
  const confirmCases = parseQuotedNames(pendingSource, /case\s+'([^']+)'/g);

  it('writes at least the known buffered tools (guards parser regression)', () => {
    expect(writtenPendingTools.size).toBeGreaterThanOrEqual(10);
    expect(writtenPendingTools.has('createTask')).toBe(true);
    expect(writtenPendingTools.has('settleExpense')).toBe(true);
  });

  it('has a confirm case for every buffered write tool', () => {
    const missing = [...writtenPendingTools].filter(
      tool => !confirmCases.has(tool) && !BESPOKE_CONFIRM_FLOW.has(tool),
    );
    expect(missing).toEqual([]);
  });

  it('does not declare a bespoke-flow tool that the executor never buffers', () => {
    // Keep the allowlist honest — an entry here must correspond to a real write.
    const stale = [...BESPOKE_CONFIRM_FLOW].filter(tool => !writtenPendingTools.has(tool));
    expect(stale).toEqual([]);
  });
});
