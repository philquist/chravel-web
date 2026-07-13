import { describe, expect, it } from 'vitest';
import type { MessageResponse } from 'stream-chat';
import {
  applyPendingReactionOverlay,
  mapStreamMessagesToChannelMessages,
  mapStreamReactionMap,
} from '@/services/stream/adapters/mappers/proChannelMessageAdapter';

describe('proChannelMessageAdapter', () => {
  it('maps stream messages into channel transport messages', () => {
    const now = new Date().toISOString();
    const streamMessages = [
      {
        id: 'p1',
        text: 'parent',
        user: { id: 'u2', name: 'Alex' },
        created_at: now,
      },
      {
        id: 'c1',
        text: 'child',
        parent_id: 'p1',
        user: { id: 'u1', name: 'Me' },
        created_at: now,
      },
    ] as unknown as MessageResponse[];

    const mapped = mapStreamMessagesToChannelMessages(streamMessages, 'channel-1');
    expect(mapped).toHaveLength(2);
    expect(mapped[1]?.metadata?.replyTo).toEqual({
      id: 'p1',
      text: 'parent',
      sender: 'Alex',
    });
  });

  it('keeps reaction toggle consistent after server echo', () => {
    const beforeEcho = [
      {
        id: 'm1',
        reaction_counts: { like: 1 },
        own_reactions: [],
        latest_reactions: [{ type: 'like', user: { id: 'u2' } }],
      },
    ] as unknown as MessageResponse[];

    const pendingOverlay = applyPendingReactionOverlay(
      mapStreamReactionMap(beforeEcho),
      { m1: { like: true } },
      'u1',
    );

    expect(pendingOverlay.m1?.like).toEqual({
      count: 2,
      userReacted: true,
      users: ['u2', 'u1'],
    });

    const afterEcho = [
      {
        id: 'm1',
        reaction_counts: { like: 2 },
        own_reactions: [{ type: 'like', user: { id: 'u1' } }],
        latest_reactions: [
          { type: 'like', user: { id: 'u2' } },
          { type: 'like', user: { id: 'u1' } },
        ],
      },
    ] as unknown as MessageResponse[];

    const echoed = applyPendingReactionOverlay(mapStreamReactionMap(afterEcho), {}, 'u1');
    expect(echoed.m1?.like).toEqual({
      count: 2,
      userReacted: true,
      users: ['u2', 'u1'],
    });
  });

  it('never mutates the base reaction map (rollback must be able to revert)', () => {
    // mapStreamReactionMap creates an entry for EVERY message, so the overlay
    // used to write through the shallow copy into the base map's inner object.
    // That made pending intents self-confirm against their own mutation and
    // left phantom reactions behind after a failed Stream write.
    const messages = [
      { id: 'm1', reaction_counts: {}, own_reactions: [], latest_reactions: [] },
    ] as unknown as MessageResponse[];
    const base = mapStreamReactionMap(messages);

    const overlaid = applyPendingReactionOverlay(base, { m1: { like: true } }, 'u1');

    expect(overlaid.m1?.like?.userReacted).toBe(true);
    // The base map must be untouched
    expect(base.m1?.like).toBeUndefined();
    // Re-running with cleared intents (the rollback path) yields no reaction
    const reverted = applyPendingReactionOverlay(base, {}, 'u1');
    expect(reverted.m1?.like).toBeUndefined();
  });
});
