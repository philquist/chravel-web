import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setPollDeepLink,
  consumePollDeepLink,
  parsePollDeepLinkFromSearch,
  requestPollDeepLink,
  POLL_DEEP_LINK_EVENT,
} from '@/lib/pollDeepLink';

describe('pollDeepLink', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and consumes a trip-scoped deep link once', () => {
    setPollDeepLink('trip-1', { pollId: 'poll-9', createPoll: false });
    expect(consumePollDeepLink('trip-1')).toEqual({ pollId: 'poll-9', createPoll: false });
    expect(consumePollDeepLink('trip-1')).toBeNull();
  });

  it('parses createPoll and pollId from search params', () => {
    expect(parsePollDeepLinkFromSearch('?tab=polls&createPoll=1')).toEqual({
      pollId: undefined,
      createPoll: true,
    });
    expect(parsePollDeepLinkFromSearch('tab=polls&pollId=abc')).toEqual({
      pollId: 'abc',
      createPoll: false,
    });
  });

  it('dispatches a window event when requesting a deep link', () => {
    const handler = vi.fn();
    window.addEventListener(POLL_DEEP_LINK_EVENT, handler);
    requestPollDeepLink('trip-2', { createPoll: true });
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail).toEqual({ tripId: 'trip-2', createPoll: true });
    window.removeEventListener(POLL_DEEP_LINK_EVENT, handler);
  });
});
