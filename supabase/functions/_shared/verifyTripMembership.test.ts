import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { verifyTripMembership } from './verifyTripMembership.ts';

/** Minimal fake client capturing the rpc call and returning a canned result. */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc(fn: string, args: unknown) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, calls };
}

Deno.test('verifyTripMembership returns isMember=true when RPC returns true', async () => {
  const { client } = fakeClient({ data: true, error: null });
  const res = await verifyTripMembership(client, 'user-1', 'trip-1');
  assertEquals(res, { isMember: true, error: null });
});

Deno.test('verifyTripMembership returns isMember=false when RPC returns false', async () => {
  const { client } = fakeClient({ data: false, error: null });
  const res = await verifyTripMembership(client, 'user-1', 'trip-1');
  assertEquals(res, { isMember: false, error: null });
});

Deno.test('verifyTripMembership surfaces infra errors distinctly from not-a-member', async () => {
  const { client } = fakeClient({ data: null, error: { message: 'boom' } });
  const res = await verifyTripMembership(client, 'user-1', 'trip-1');
  assertEquals(res, { isMember: false, error: 'boom' });
});

Deno.test('verifyTripMembership calls is_trip_member with the expected args', async () => {
  const { client, calls } = fakeClient({ data: true, error: null });
  await verifyTripMembership(client, 'user-42', 'trip-99');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'is_trip_member');
  assertEquals(calls[0].args, { _user_id: 'user-42', _trip_id: 'trip-99' });
});
