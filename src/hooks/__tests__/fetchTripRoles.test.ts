import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTripRoles, FETCH_TRIP_ROLES_TIMEOUT_MS } from '../fetchTripRoles';

const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/services/mockRolesService', () => ({
  MockRolesService: {
    getRolesForTrip: vi.fn(() => []),
  },
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function mockQuery(result: QueryResult | (() => Promise<QueryResult>)) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  const resolveResult = () => (typeof result === 'function' ? result() : Promise.resolve(result));
  builder.order = vi.fn(resolveResult);
  // Make the builder thenable so awaiting `.in(...)` works for count/channel queries.
  Object.assign(builder, {
    then(onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) {
      return resolveResult().then(onFulfilled, onRejected);
    },
  });
  return builder;
}

describe('fetchTripRoles', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('loads roles without embedding trip_channels and still returns when channel fetch fails', async () => {
    const roleRow = {
      id: 'role-1',
      trip_id: 'trip-1',
      role_name: 'Coaches',
      description: null,
      permission_level: 'edit',
      feature_permissions: null,
      created_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'trip_roles') {
        return mockQuery({ data: [roleRow], error: null });
      }
      if (table === 'user_trip_roles') {
        return mockQuery({ data: [{ role_id: 'role-1' }, { role_id: 'role-1' }], error: null });
      }
      if (table === 'trip_channels') {
        return mockQuery({ data: null, error: { message: 'RLS denied channels' } });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const roles = await fetchTripRoles('trip-1', false);

    expect(roles).toHaveLength(1);
    expect(roles[0].roleName).toBe('Coaches');
    expect(roles[0].memberCount).toBe(2);
    expect(roles[0].channels).toEqual([]);
    // Critical: primary select must not use the old embed that hung Manage Roles.
    const rolesBuilder = fromMock.mock.results[0]?.value as { select: ReturnType<typeof vi.fn> };
    expect(rolesBuilder.select).toHaveBeenCalled();
    const selectArg = String(rolesBuilder.select.mock.calls[0]?.[0] ?? '');
    expect(selectArg).not.toContain('trip_channels!');
  });

  it('times out instead of hanging forever when the roles query never settles', async () => {
    fromMock.mockImplementation(() => mockQuery(() => new Promise(() => {})));

    await expect(fetchTripRoles('trip-1', false, 50)).rejects.toThrow(/timed out/i);
    expect(FETCH_TRIP_ROLES_TIMEOUT_MS).toBeGreaterThan(1000);
  });
});
