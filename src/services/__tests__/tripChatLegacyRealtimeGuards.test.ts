import { beforeEach, describe, expect, it, vi } from 'vitest';

const channelMock = vi.fn();

const chain = {
  on: vi.fn(() => chain),
  subscribe: vi.fn(() => chain),
  unsubscribe: vi.fn(),
};

vi.mock('../../integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => channelMock(...args),
    auth: {
      onAuthStateChange: vi.fn(),
      getUser: vi.fn(),
    },
  },
}));

import { subscribeToMediaUpdates, subscribeToThreadReplies } from '../chatService';

describe('trip chat legacy realtime guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.on.mockReturnValue(chain);
    chain.subscribe.mockReturnValue(chain);
    channelMock.mockReturnValue(chain);
  });

  it('does not start Supabase trip realtime subscriptions when Stream is configured', () => {
    vi.stubEnv('VITE_STREAM_CHAT_DISABLED', 'false');

    subscribeToThreadReplies('parent-1', vi.fn());
    subscribeToMediaUpdates('trip-1', vi.fn());

    expect(channelMock).not.toHaveBeenCalled();
  });

  it('preserves legacy Supabase subscriptions when Stream is not configured', () => {
    vi.stubEnv('VITE_STREAM_CHAT_DISABLED', 'true');

    subscribeToThreadReplies('parent-1', vi.fn());

    expect(channelMock).toHaveBeenCalledWith('thread-parent-1');
    expect(chain.on).toHaveBeenCalled();
    expect(chain.subscribe).toHaveBeenCalled();
  });
});
