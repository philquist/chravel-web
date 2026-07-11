import { describe, expect, it } from 'vitest';
import {
  buildTripStreamMessagePayload,
  extractQuotedReferenceFromStreamMessage,
} from '../streamMessagePayload';

describe('buildTripStreamMessagePayload', () => {
  it('builds normalized payload with metadata fields', () => {
    const result = buildTripStreamMessagePayload({
      content: '  hello world  ',
      messageType: 'broadcast',
      privacyMode: 'friends',
      replyToId: 'msg-1',
      quotedReference: {
        id: 'msg-1',
        text: 'Original message',
        authorName: 'Alex',
        createdAt: '2026-04-21T09:10:00.000Z',
      },
      mentionedUserIds: ['u1', 'u2'],
      mediaType: 'image',
      mediaUrl: 'https://cdn.example/image.png',
      idempotencyKey: 'send-abc',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.normalizedContent).toBe('hello world');
    expect(result.payload).toMatchObject({
      text: 'hello world',
      message_type: 'broadcast',
      privacy_mode: 'friends',
      parent_id: 'msg-1',
      quoted_reference: {
        id: 'msg-1',
        text: 'Original message',
        authorName: 'Alex',
        createdAt: '2026-04-21T09:10:00.000Z',
      },
      mentioned_users: ['u1', 'u2'],
      idempotency_key: 'send-abc',
    });
    expect(result.payload.attachments).toEqual([
      { type: 'image', asset_url: 'https://cdn.example/image.png' },
    ]);
  });

  it('rejects empty content', () => {
    const result = buildTripStreamMessagePayload({ content: '   ' });
    expect(result).toEqual({ ok: false, error: 'empty_content' });
  });

  it('allows a caption-less media message (attachment with empty content)', () => {
    // Regression: photo/video sent without a caption used to be rejected as empty_content
    // before attachments were considered, so the media uploaded but never posted to chat.
    const result = buildTripStreamMessagePayload({
      content: '',
      mediaType: 'image',
      mediaUrl: 'https://cdn.example/photo.png',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.text).toBe('');
    expect(result.payload.attachments).toEqual([
      { type: 'image', asset_url: 'https://cdn.example/photo.png' },
    ]);
  });

  it('rejects content over 4000 chars', () => {
    const result = buildTripStreamMessagePayload({ content: 'x'.repeat(4001) });
    expect(result).toEqual({ ok: false, error: 'content_too_long' });
  });

  it('extracts quoted reference from stream extra_data for top-level quoted replies', () => {
    const parsed = extractQuotedReferenceFromStreamMessage({
      extra_data: {
        quoted_reference: {
          id: 'msg-top-level',
          text: 'Where should we stay?',
          authorName: 'Morgan',
          createdAt: '2026-04-20T18:32:00.000Z',
        },
      },
    });

    expect(parsed).toEqual({
      id: 'msg-top-level',
      text: 'Where should we stay?',
      authorName: 'Morgan',
      createdAt: '2026-04-20T18:32:00.000Z',
    });
  });

  it('round-trips quoted reference through payload and parser', () => {
    const result = buildTripStreamMessagePayload({
      content: 'Quoted reply payload',
      quotedReference: {
        id: 'msg-parent',
        text: 'Original thread starter',
        authorName: 'Taylor',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = extractQuotedReferenceFromStreamMessage({
      quoted_reference: (result.payload as any).quoted_reference,
    });
    expect(parsed).toEqual({
      id: 'msg-parent',
      text: 'Original thread starter',
      authorName: 'Taylor',
      createdAt: undefined,
    });
  });
});
