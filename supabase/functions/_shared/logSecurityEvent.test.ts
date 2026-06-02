import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { logSecurityEvent } from './logSecurityEvent.ts';

/** Fake client capturing the inserted row and returning a canned result. */
function fakeClient(behavior: { error?: { message: string } | null; throws?: boolean }) {
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          if (behavior.throws) throw new Error('connection lost');
          return Promise.resolve({ error: behavior.error ?? null });
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, inserts };
}

Deno.test('logSecurityEvent writes the live security_audit_log columns', async () => {
  const { client, inserts } = fakeClient({ error: null });
  await logSecurityEvent(client, {
    userId: 'user-1',
    action: 'livekit.token_issued',
    tableName: 'livekit',
    metadata: { roomName: 'voice-1' },
  });
  assertEquals(inserts.length, 1);
  const row = inserts[0];
  assertEquals(row.user_id, 'user-1');
  assertEquals(row.action, 'livekit.token_issued');
  assertEquals(row.table_name, 'livekit');
  assertEquals(row.record_id, null);
  assertEquals(row.metadata, { roomName: 'voice-1' });
});

Deno.test('logSecurityEvent defaults table_name to a non-null value', async () => {
  const { client, inserts } = fakeClient({ error: null });
  await logSecurityEvent(client, { userId: null, action: 'stream.token_issued' });
  assertEquals(inserts[0].table_name, 'edge_function');
  assertEquals(inserts[0].metadata, {});
});

Deno.test('logSecurityEvent never throws on insert error (fail-open)', async () => {
  const { client } = fakeClient({ error: { message: 'rls denied' } });
  // Should resolve without throwing.
  await logSecurityEvent(client, { userId: 'u', action: 'a' });
});

Deno.test('logSecurityEvent never throws when the client throws (fail-open)', async () => {
  const { client } = fakeClient({ throws: true });
  await logSecurityEvent(client, { userId: 'u', action: 'a' });
});
