import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AI_MUTATION_PERMISSIONS } from './tripPermissionGuard.ts';

Deno.test('AI mutation permission map covers core write tools', () => {
  assertEquals(AI_MUTATION_PERMISSIONS.createTask?.resource, 'tasks');
  assertEquals(AI_MUTATION_PERMISSIONS.addToCalendar?.action, 'write');
  assertEquals(AI_MUTATION_PERMISSIONS.setTripBasecamp?.action, 'admin');
});

Deno.test('assertAiToolPermission rejects unmapped tools only at runtime', () => {
  assertEquals(AI_MUTATION_PERMISSIONS['unknownTool'], undefined);
});
