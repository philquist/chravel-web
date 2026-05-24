import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { assertRoleAccess } from './permissionGuard.ts';

Deno.test('assertRoleAccess allows privileged action', () => {
  assertEquals(assertRoleAccess('pro_admin', 'tasks', 'admin'), undefined);
});

Deno.test('assertRoleAccess blocks denied action', () => {
  assertThrows(() => assertRoleAccess('event_attendee', 'calendar', 'delete'));
});
