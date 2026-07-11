import { describe, it, expect, vi } from 'vitest';
import type { MessageResponse } from 'stream-chat';
import { isDeletedStreamMessage, withTimeout } from '@/hooks/stream/streamChatUtils';

const msg = (over: Partial<MessageResponse>): MessageResponse =>
  ({ id: 'm1', ...over }) as MessageResponse;

describe('isDeletedStreamMessage', () => {
  it('detects soft-deleted messages by deleted_at or type', () => {
    expect(isDeletedStreamMessage(msg({ deleted_at: '2026-01-01T00:00:00Z' }))).toBe(true);
    expect(isDeletedStreamMessage(msg({ type: 'deleted' }))).toBe(true);
  });

  it('treats normal messages as not deleted', () => {
    expect(isDeletedStreamMessage(msg({ text: 'hi', type: 'regular' }))).toBe(false);
    expect(isDeletedStreamMessage(msg({ text: 'hi' }))).toBe(false);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'op')).resolves.toBe('ok');
  });

  it('rejects with a labeled error when the promise hangs past the deadline', async () => {
    vi.useFakeTimers();
    const hang = new Promise<string>(() => {}); // never settles
    const guarded = withTimeout(hang, 15000, 'channel.watch');
    const assertion = expect(guarded).rejects.toThrow(/channel\.watch timed out/);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    vi.useRealTimers();
  });

  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'op')).rejects.toThrow(
      'boom',
    );
  });
});
