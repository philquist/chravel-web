import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AI_MUTATION_PERMISSIONS, RLS_BACKSTOPPED_MUTATION_TOOLS } from './tripPermissionGuard.ts';
import { MUTATING_TOOL_NAMES } from './concierge/toolRegistry.ts';

Deno.test('AI mutation permission map covers core write tools with real tool names', () => {
  assertEquals(AI_MUTATION_PERMISSIONS.createTask?.resource, 'tasks');
  assertEquals(AI_MUTATION_PERMISSIONS.addToCalendar?.action, 'write');
  // Real tool is `setBasecamp` (basecamp is not matrix-writable for pro_editor, so
  // it is intentionally RLS-backstopped rather than matrix-mapped).
  assertEquals(AI_MUTATION_PERMISSIONS.setBasecamp, undefined);
  assertEquals(RLS_BACKSTOPPED_MUTATION_TOOLS.has('setBasecamp'), true);
});

Deno.test('the phantom/misnamed keys are gone', () => {
  for (const phantom of ['deletePoll', 'addExploreLink', 'rescheduleEvent', 'setTripBasecamp']) {
    assertEquals(AI_MUTATION_PERMISSIONS[phantom], undefined);
  }
});

Deno.test('every mutating tool is classified (mapped or explicitly RLS-backstopped)', () => {
  const unclassified: string[] = [];
  for (const tool of MUTATING_TOOL_NAMES) {
    const mapped = Boolean(AI_MUTATION_PERMISSIONS[tool]);
    const backstopped = RLS_BACKSTOPPED_MUTATION_TOOLS.has(tool);
    if (mapped === backstopped) {
      // must be exactly one of the two (not both, not neither)
      unclassified.push(tool);
    }
  }
  assertEquals(unclassified, []);
});

Deno.test('RLS-backstop set does not reference unknown tools', () => {
  const stray = [...RLS_BACKSTOPPED_MUTATION_TOOLS].filter(t => !MUTATING_TOOL_NAMES.has(t));
  assertEquals(stray, []);
});
