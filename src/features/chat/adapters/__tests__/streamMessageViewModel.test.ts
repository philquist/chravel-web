import { describe, expect, it } from 'vitest';
import type { MessageResponse } from 'stream-chat';
import {
  buildStreamMessageViewModels,
  mapStreamMessageToViewModel,
} from '../streamMessageViewModel';

const members = [
  { id: 'user-1', name: 'Alex', avatar: 'alex.png' },
  { id: 'user-2', name: 'Bailey', avatar: 'bailey.png' },
  { id: 'user-3', name: 'Casey', avatar: 'casey.png' },
];

const baseMessage = (overrides: Partial<MessageResponse> = {}): MessageResponse =>
  ({
    id: 'm1',
    text: 'hello',
    user: { id: 'user-1', name: 'Alex' },
    created_at: '2026-04-20T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    ...overrides,
  }) as MessageResponse;

describe('buildStreamMessageViewModels', () => {
  it('marks edited messages when updated_at differs', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          updated_at: '2026-04-20T10:05:00.000Z',
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].isEdited).toBe(true);
    expect(results[0].editedAt).toBe('2026-04-20T10:05:00.000Z');
  });

  it('extracts media attachment and link preview from stream attachments', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          attachments: [
            { type: 'image', image_url: 'https://cdn/image.png' },
            {
              type: 'file',
              og_scrape_url: 'https://example.com',
              title: 'Example',
              text: 'desc',
              thumb_url: 'https://cdn/thumb.png',
            },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].mediaType).toBe('image');
    expect(results[0].mediaUrl).toBe('https://cdn/image.png');
    expect(results[0].linkPreview).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      description: 'desc',
      image: 'https://cdn/thumb.png',
    });
    // Mosaic list includes the image; OG-only file rows without asset_url are excluded.
    expect(results[0].attachments).toEqual([
      { type: 'image', ref_id: 'att-0', url: 'https://cdn/image.png' },
    ]);
  });

  it('maps multi-image attachments for mosaic rendering', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          attachments: [
            { type: 'image', asset_url: 'https://cdn/a.jpg' },
            { type: 'image', asset_url: 'https://cdn/b.jpg' },
            { type: 'image', asset_url: 'https://cdn/c.jpg' },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].attachments).toHaveLength(3);
    expect(results[0].attachments?.every(a => a.type === 'image')).toBe(true);
  });

  it('maps audio attachments with voice-note metadata', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          text: '',
          attachments: [
            {
              type: 'audio',
              asset_url: 'https://cdn/voice-note.webm',
              mime_type: 'audio/webm',
              duration_ms: 4200,
              waveform: [0.2, 0.5, 0.8],
            },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].mediaType).toBe('audio');
    expect(results[0].mediaUrl).toBe('https://cdn/voice-note.webm');
    expect(results[0].attachments?.[0]).toMatchObject({
      type: 'audio',
      url: 'https://cdn/voice-note.webm',
      mimeType: 'audio/webm',
      durationMs: 4200,
      waveform: [0.2, 0.5, 0.8],
    });
  });

  it('does not classify video/webm as audio from extension alone', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          text: '',
          attachments: [
            {
              type: 'video',
              asset_url: 'https://cdn/clip.webm',
              mime_type: 'video/webm',
            },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].mediaType).toBe('video');
    expect(results[0].attachments?.[0]).toMatchObject({
      type: 'video',
      url: 'https://cdn/clip.webm',
      mimeType: 'video/webm',
    });
  });

  it('still maps audio/webm voice notes via mime when type is file', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          text: '',
          attachments: [
            {
              type: 'file',
              asset_url: 'https://cdn/voice.webm',
              mime_type: 'audio/webm',
              duration_ms: 2100,
            },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].mediaType).toBe('audio');
    expect(results[0].attachments?.[0]?.type).toBe('audio');
  });

  it('normalizes Stream file attachments to document mediaType with downloadable url', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          attachments: [
            { type: 'file', asset_url: 'https://cdn/itinerary.pdf', title: 'itinerary.pdf' },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].mediaType).toBe('document');
    expect(results[0].mediaUrl).toBe('https://cdn/itinerary.pdf');
    expect(results[0].attachments?.[0]).toMatchObject({
      type: 'file',
      url: 'https://cdn/itinerary.pdf',
    });
  });

  it('maps voice-note attachments with transcript metadata', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          text: '',
          attachments: [
            {
              type: 'audio',
              asset_url: 'https://cdn/voice.webm',
              ref_id: 'file-1',
              mimeType: 'audio/webm',
              durationMs: 2000,
              waveform: [0.1, 0.9],
              transcript: 'boarding starts soon',
            },
          ] as unknown as MessageResponse['attachments'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].attachments).toEqual([
      {
        type: 'audio',
        ref_id: 'file-1',
        url: 'https://cdn/voice.webm',
        mimeType: 'audio/webm',
        durationMs: 2000,
        waveform: [0.1, 0.9],
        transcript: 'boarding starts soon',
      },
    ]);
  });

  it('maps reaction counts, user reacted flag, and users list', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          reaction_counts: { love: 2 } as unknown as MessageResponse['reaction_counts'],
          own_reactions: [
            { type: 'love', user: { id: 'user-1' } },
          ] as unknown as MessageResponse['own_reactions'],
          latest_reactions: [
            { type: 'love', user: { id: 'user-1' } },
            { type: 'love', user: { id: 'user-2' } },
          ] as unknown as MessageResponse['latest_reactions'],
        }),
      ],
      tripMembers: members,
    });

    expect(results[0].reactions?.love).toEqual({
      count: 2,
      userReacted: true,
      users: ['user-1', 'user-2'],
    });
  });

  it('marks a message_type=broadcast message as a broadcast', () => {
    const results = buildStreamMessageViewModels({
      messages: [baseMessage({ message_type: 'broadcast' } as unknown as MessageResponse)],
      tripMembers: members,
    });

    expect(results[0].isBroadcast).toBe(true);
  });

  it('marks a privacy_mode=broadcast message as a broadcast (matches the unread badge)', () => {
    // Regression: the Broadcasts tab filter reads isBroadcast, but the badge count
    // (useUnreadCounts) also treats privacy_mode==='broadcast' as a broadcast. When
    // isBroadcast ignored privacy_mode, the badge showed a count while the tab was empty.
    const results = buildStreamMessageViewModels({
      messages: [baseMessage({ privacy_mode: 'broadcast' } as unknown as MessageResponse)],
      tripMembers: members,
    });

    expect(results[0].isBroadcast).toBe(true);
  });

  it('does not mark a standard-privacy message as a broadcast', () => {
    const results = buildStreamMessageViewModels({
      messages: [baseMessage({ privacy_mode: 'standard' } as unknown as MessageResponse)],
      tripMembers: members,
    });

    expect(results[0].isBroadcast).toBe(false);
  });

  it('maps pinned=true state and pinned_at timestamp', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          pinned: true,
          pinned_at: '2026-04-20T10:30:00.000Z',
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
    });

    expect(results[0].isPinned).toBe(true);
    expect(results[0].pinnedAt).toBe('2026-04-20T10:30:00.000Z');
  });

  it('maps pinned=false state as unpinned', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          pinned: false,
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
    });

    expect(results[0].isPinned).toBe(false);
    expect(results[0].pinnedAt).toBeUndefined();
  });

  it('hydrates pinned state from pinned_at when pinned flag is omitted', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          pinned_at: '2026-04-20T10:45:00.000Z',
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
    });

    expect(results[0].isPinned).toBe(true);
    expect(results[0].pinnedAt).toBe('2026-04-20T10:45:00.000Z');
  });

  it('drops stale pinned_at when payload marks message as explicitly unpinned', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          pinned: false,
          pinned_at: '2026-04-20T10:30:00.000Z',
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
    });

    expect(results[0].isPinned).toBe(false);
    expect(results[0].pinnedAt).toBeUndefined();
  });

  it('resolves parent reply context from parent message', () => {
    const parent = baseMessage({
      id: 'parent-1',
      text: 'parent text',
      user: { id: 'user-2', name: 'Bailey' },
    });
    const child = baseMessage({ id: 'child-1', parent_id: 'parent-1', text: 'child text' });
    const membersById = new Map(members.map(member => [member.id, member]));
    const messageById = new Map([
      [parent.id, parent],
      [child.id, child],
    ]);

    const vm = mapStreamMessageToViewModel({
      message: child,
      membersById,
      messageById,
    });

    expect(vm.replyTo).toEqual({
      id: 'parent-1',
      text: 'parent text',
      sender: 'Bailey',
    });
  });

  it('projects read-state for eligible members only', () => {
    const results = buildStreamMessageViewModels({
      messages: [baseMessage()],
      tripMembers: members,
      currentUserId: 'user-1',
      channelReadState: {
        'user-1': { last_read: '2026-04-20T10:10:00.000Z' },
        'user-2': { last_read: '2026-04-20T10:11:00.000Z' },
        'user-4': { last_read: '2026-04-20T10:12:00.000Z' },
      },
    });

    expect(results[0].readStatuses).toEqual([
      {
        id: 'm1:user-2',
        message_id: 'm1',
        user_id: 'user-2',
        read_at: '2026-04-20T10:11:00.000Z',
        created_at: '2026-04-20T10:11:00.000Z',
      },
    ]);
  });

  it('keeps TripChat timeline to top-level stream messages', () => {
    const parent = baseMessage({ id: 'p1', text: 'Original' });
    const topLevel = baseMessage({
      id: 'm2',
      text: 'Visible',
      reply_to_id: 'p1',
    } as unknown as MessageResponse);

    const results = buildStreamMessageViewModels({
      messages: [parent, topLevel],
      tripMembers: members,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('maps thread metadata for parent messages with replies', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          id: 'parent-with-replies',
          text: 'Parent',
          reply_count: 2,
          latest_replies: [
            { id: 'r1', text: 'First reply' },
            { id: 'r2', text: 'Latest thread reply preview' },
          ],
          thread_participant_ids: ['user-1'],
          thread_unread_count: 1,
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
      currentUserId: 'user-1',
    });

    expect(results[0].replyCount).toBe(2);
    expect(results[0].threadPreviewSnippet).toBe('Latest thread reply preview');
    expect(results[0].hasUnreadThreadReplies).toBe(true);
  });

  it('uses read markers when thread unread counters are unavailable', () => {
    const results = buildStreamMessageViewModels({
      messages: [
        baseMessage({
          id: 'parent-read-marker',
          text: 'Parent',
          reply_count: 1,
          latest_replies: [
            {
              id: 'r-latest',
              text: 'Unread thread reply',
              created_at: '2026-04-20T10:20:00.000Z',
            },
          ],
          thread_participant_ids: ['user-1'],
          thread_unread_count: 0,
        } as unknown as MessageResponse),
      ],
      tripMembers: members,
      currentUserId: 'user-1',
      channelReadState: {
        'user-1': { last_read: '2026-04-20T10:15:00.000Z' },
      },
    });

    expect(results[0].replyCount).toBe(1);
    expect(results[0].threadPreviewSnippet).toBe('Unread thread reply');
    expect(results[0].hasUnreadThreadReplies).toBe(true);
  });
});
