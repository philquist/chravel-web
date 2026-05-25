import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const parseNames = (s: string, re: RegExp) =>
  new Set([...s.matchAll(re)].map(m => m[1]).filter(Boolean));

function parseNamedSet(source: string, name: string): Set<string> {
  const start = source.search(new RegExp(`${name}\\s*=`));
  if (start === -1) return new Set();
  const open = source.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++;
    if (source[i] === ']') {
      depth--;
      if (depth === 0) return parseNames(source.slice(open, i + 1), /'([^']+)'/g);
    }
  }
  return new Set();
}

describe('concierge write reliability static coverage', () => {
  const registry = read('supabase/functions/_shared/concierge/toolRegistry.ts');
  const executor = read('supabase/functions/_shared/functionExecutor.ts');
  const invalidation = read('src/lib/conciergeInvalidation.ts');

  const allTools = parseNames(registry, /name:\s*'([^']+)'/g);
  const writeTools = parseNamedSet(registry, 'MUTATING_TOOL_NAMES');
  const executorCases = parseNames(executor, /case\s+'([^']+)'/g);
  const invalidationSet = parseNamedSet(invalidation, 'CONCIERGE_WRITE_ACTIONS');

  it('keeps declaration count at expected audited total', () => {
    expect(allTools.size).toBe(74);
  });

  it('ensures each declared write tool has executor coverage', () => {
    const missing = [...writeTools].filter(t => !executorCases.has(t));
    expect(missing).toEqual([]);
  });

  it('ensures each declared write tool has frontend invalidation routing', () => {
    const missing = [...writeTools].filter(t => !invalidationSet.has(t));
    expect(missing).toEqual([]);
  });
});
