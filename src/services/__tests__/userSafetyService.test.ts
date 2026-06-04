import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlockedUserProfiles } from '../userSafetyService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

describe('getBlockedUserProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves block recency order and resolves display names with fallback', async () => {
    // user_blocks → ids most-recent-first
    const blocksBuilder = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ blocked_id: 'u1' }, { blocked_id: 'u2' }, { blocked_id: 'u3' }],
          error: null,
        }),
      }),
    };
    // profiles_public → returned OUT of order, with u3 missing entirely
    const profilesBuilder = {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            { user_id: 'u2', display_name: 'Bob', resolved_display_name: null, avatar_url: null },
            {
              user_id: 'u1',
              display_name: 'ignored',
              resolved_display_name: 'Alice',
              avatar_url: 'a.png',
            },
          ],
          error: null,
        }),
      }),
    };
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_blocks') return blocksBuilder as never;
      if (table === 'profiles_public') return profilesBuilder as never;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getBlockedUserProfiles();

    expect(result).toEqual([
      { id: 'u1', displayName: 'Alice', avatarUrl: 'a.png' }, // resolved_display_name preferred
      { id: 'u2', displayName: 'Bob', avatarUrl: null }, // display_name fallback
      { id: 'u3', displayName: 'Chravel user', avatarUrl: null }, // missing profile → generic
    ]);
  });

  it('short-circuits with no profiles query when nothing is blocked', async () => {
    const blocksBuilder = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const fromMock = vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_blocks') return blocksBuilder as never;
      throw new Error(`should not query ${table}`);
    });

    const result = await getBlockedUserProfiles();

    expect(result).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('user_blocks');
  });
});
