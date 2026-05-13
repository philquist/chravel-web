import { describe, expect, it } from 'vitest';
import {
  OPENAI_REALTIME_CALLS_SDP_URL,
  resolveOpenAiRealtimeSdpPostUrl,
} from '../openaiRealtimeWebRtc';

describe('resolveOpenAiRealtimeSdpPostUrl', () => {
  it('defaults to the official GA Realtime calls endpoint', () => {
    expect(resolveOpenAiRealtimeSdpPostUrl(undefined)).toBe(OPENAI_REALTIME_CALLS_SDP_URL);
    expect(resolveOpenAiRealtimeSdpPostUrl({})).toBe(OPENAI_REALTIME_CALLS_SDP_URL);
  });

  it('honors explicit https override from session payload', () => {
    const custom = 'https://example.com/v1/realtime/calls';
    expect(resolveOpenAiRealtimeSdpPostUrl({ realtime_calls_url: custom })).toBe(custom);
    expect(resolveOpenAiRealtimeSdpPostUrl({ realtime_sdp_url: custom })).toBe(custom);
  });
});
