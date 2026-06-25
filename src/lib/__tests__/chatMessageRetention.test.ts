import { describe, expect, it } from 'vitest';
import { capPrependedMessages, capRetainedMessages } from '../chatMessageRetention';

describe('capRetainedMessages', () => {
  it('keeps newest messages when over cap', () => {
    const messages = Array.from({ length: 300 }, (_, index) => ({ id: `m-${index}` }));
    const capped = capRetainedMessages(messages, 250);
    expect(capped).toHaveLength(250);
    expect(capped[0].id).toBe('m-50');
    expect(capped[capped.length - 1].id).toBe('m-299');
  });

  it('keeps oldest messages when prepending history over cap', () => {
    const current = Array.from({ length: 250 }, (_, index) => ({ id: `new-${index}` }));
    const older = Array.from({ length: 30 }, (_, index) => ({ id: `old-${index}` }));
    const capped = capPrependedMessages(older, current, 250);
    expect(capped).toHaveLength(250);
    expect(capped[0].id).toBe('old-0');
    expect(capped[29].id).toBe('old-29');
  });
});
