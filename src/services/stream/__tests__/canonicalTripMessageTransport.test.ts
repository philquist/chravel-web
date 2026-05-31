import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTripMessageWithCanonicalTransport } from '../canonicalTripMessageTransport';
import { sendTripMessageViaStream } from '../tripMessageTransport';
import { sendChatMessage } from '@/services/chatService';
import { isStreamConfigured } from '../streamTransportGuards';

vi.mock('../tripMessageTransport', () => ({
  sendTripMessageViaStream: vi.fn(),
}));

vi.mock('@/services/chatService', () => ({
  sendChatMessage: vi.fn(),
}));

vi.mock('../streamTransportGuards', () => ({
  isStreamConfigured: vi.fn(),
}));

describe('sendTripMessageWithCanonicalTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses Stream when the canonical transport succeeds', async () => {
    vi.mocked(sendTripMessageViaStream).mockResolvedValue({ id: 'stream-message' });
    vi.mocked(isStreamConfigured).mockReturnValue(true);

    await expect(
      sendTripMessageWithCanonicalTransport('trip-1', { content: 'hello' }),
    ).resolves.toEqual({ id: 'stream-message' });

    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('does not fall back to legacy chat when Stream is configured but inactive', async () => {
    vi.mocked(sendTripMessageViaStream).mockResolvedValue(null);
    vi.mocked(isStreamConfigured).mockReturnValue(true);

    await expect(
      sendTripMessageWithCanonicalTransport('trip-1', { content: 'hello' }),
    ).rejects.toThrow('Chat connection unavailable');

    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('uses legacy chat only when Stream is not configured', async () => {
    vi.mocked(sendTripMessageViaStream).mockResolvedValue(null);
    vi.mocked(isStreamConfigured).mockReturnValue(false);
    vi.mocked(sendChatMessage).mockResolvedValue({ id: 'legacy-message' } as never);

    await expect(
      sendTripMessageWithCanonicalTransport('trip-1', { content: 'hello' }),
    ).resolves.toEqual({ id: 'legacy-message' });

    expect(sendChatMessage).toHaveBeenCalledWith({ content: 'hello' });
  });
});
