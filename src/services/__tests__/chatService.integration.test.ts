import { beforeEach, describe, expect, it, vi } from 'vitest';

const authChangeCallbacks: Array<() => void> = [];
const insertSingle = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq, single: insertSingle }));
const insert = vi.fn(() => ({ select }));
const from = vi.fn(() => ({ insert, select }));
const getUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser,
      onAuthStateChange: vi.fn(callback => {
        authChangeCallbacks.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from,
  },
}));

vi.mock('../stream/streamTransportGuards', () => ({ isStreamConfigured: () => false }));

describe('chatService - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'traveler@example.com' } } });
    maybeSingle.mockResolvedValue({ data: { display_name: 'Real Traveler' }, error: null });
    insertSingle.mockResolvedValue({
      data: { id: 'msg-1', content: 'Hello', author_name: 'Real Traveler' },
      error: null,
    });
  });

  it('sends legacy chat messages with the authenticated profile name', async () => {
    const { sendChatMessage } = await import('../chatService');

    const result = await sendChatMessage({
      trip_id: 'trip-1',
      content: 'Hello',
      author_name: 'Spoofed',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_name: 'Real Traveler',
        content: 'Hello',
        trip_id: 'trip-1',
      }),
    );
    expect(result).toMatchObject({ id: 'msg-1', author_name: 'Real Traveler' });
  });

  it('falls back to the client name when no authenticated user is available', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const { invalidateAuthorNameCache, sendChatMessage } = await import('../chatService');
    invalidateAuthorNameCache();

    await sendChatMessage({ trip_id: 'trip-1', content: 'Hello', author_name: 'Fallback' });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ author_name: 'Fallback' }));
  });
});
