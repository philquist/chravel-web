import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const getUserMock = vi.fn();

/**
 * Chainable query-builder stub: every filter method returns the builder;
 * awaiting it (or .single()) resolves the preset response for its table.
 */
const tableResponses = new Map<string, unknown>();

function makeBuilder(table: string) {
  const response = () => tableResponses.get(table) ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  ['select', 'eq', 'in', 'order', 'limit'].forEach(method => {
    builder[method] = vi.fn(chain);
  });
  builder.single = vi.fn(() => Promise.resolve(response()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response()));
  // Make the builder awaitable like a PostgrestFilterBuilder
  builder.then = (resolve: (value: unknown) => unknown) => resolve(response());
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    from: (table: string) => makeBuilder(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { channelService } from '../channelService';

describe('channelService.getAccessibleChannels member counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResponses.clear();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('admin path: applies counts from the single RPC call (no per-channel loops)', async () => {
    tableResponses.set('trips', { data: { created_by: 'user-1' }, error: null });
    tableResponses.set('trip_admins', { data: { id: 'admin-row' }, error: null });
    tableResponses.set('trip_channels', {
      data: [
        {
          id: 'c1',
          trip_id: 'trip-1',
          channel_name: 'Coaches',
          channel_slug: 'coaches',
          required_role_id: 'r1',
          is_private: true,
          is_archived: false,
          created_by: 'user-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          trip_roles: { role_name: 'Coaches' },
        },
        {
          id: 'c2',
          trip_id: 'trip-1',
          channel_name: 'Staff',
          channel_slug: 'staff',
          required_role_id: 'r2',
          is_private: true,
          is_archived: false,
          created_by: 'user-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          trip_roles: { role_name: 'Staff' },
        },
      ],
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: [
        { channel_id: 'c1', member_count: 7 },
        { channel_id: 'c2', member_count: 2 },
      ],
      error: null,
    });

    const channels = await channelService.getAccessibleChannels('trip-1');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('get_channel_member_counts', { p_trip_id: 'trip-1' });
    expect(channels.map(c => [c.id, c.memberCount])).toEqual([
      ['c1', 7],
      ['c2', 2],
    ]);
  });

  it('degrades to zero counts (not a thrown error) when the RPC fails', async () => {
    tableResponses.set('trips', { data: { created_by: 'user-1' }, error: null });
    tableResponses.set('trip_admins', { data: { id: 'admin-row' }, error: null });
    tableResponses.set('trip_channels', {
      data: [
        {
          id: 'c1',
          trip_id: 'trip-1',
          channel_name: 'Coaches',
          channel_slug: 'coaches',
          required_role_id: 'r1',
          is_private: true,
          is_archived: false,
          created_by: 'user-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          trip_roles: { role_name: 'Coaches' },
        },
      ],
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const channels = await channelService.getAccessibleChannels('trip-1');

    expect(channels).toHaveLength(1);
    expect(channels[0].memberCount ?? 0).toBe(0);
  });
});
