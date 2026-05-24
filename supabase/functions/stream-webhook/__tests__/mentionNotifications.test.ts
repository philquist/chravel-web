import { describe, expect, it } from 'vitest';
import {
  buildMentionNotificationRows,
  filterMentionRecipientsByPreferences,
  resolveEligibleMentionRecipients,
} from '../mentionNotifications.ts';

describe('stream-webhook mention integrations', () => {
  it('filters mention recipients using mentions_only/chat_messages preferences', () => {
    const recipients = ['u1', 'u2', 'u3'];
    const filtered = filterMentionRecipientsByPreferences(recipients, [
      { user_id: 'u1', mentions_only: false, chat_messages: false },
      { user_id: 'u2', mentions_only: false, chat_messages: true },
    ]);

    expect(filtered).toEqual(['u2', 'u3']);
  });

  it('creates mention notification rows with stream metadata for each recipient', () => {
    const rows = buildMentionNotificationRows({
      recipientIds: ['u2', 'u3'],
      senderName: 'Alex',
      messageText: '@Sam hi',
      messageId: 'msg-123',
      eventType: 'message.new',
      webhookId: 'wh-1',
      channelType: 'chravel-trip',
      channelId: 'trip-1',
      tripId: 'ec5fb8d1-fd98-4323-a471-e19959532aa6',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: 'u2',
      type: 'mention',
      title: 'Alex',
      message: '@Sam hi',
      trip_id: 'ec5fb8d1-fd98-4323-a471-e19959532aa6',
      metadata: {
        source: 'stream-webhook',
        stream_message_id: 'msg-123',
        stream_event_type: 'message.new',
        stream_webhook_id: 'wh-1',
        stream_channel_type: 'chravel-trip',
        stream_channel_id: 'trip-1',
      },
    });
  });

  it('fails closed when preference lookup errors', () => {
    const eligible = resolveEligibleMentionRecipients({
      validRecipients: ['u1', 'u2'],
      preferenceRows: null,
      preferenceError: { message: 'db timeout' },
    });
    expect(eligible).toEqual([]);
  });

  it('passes through all recipients when preference rows are unavailable without error', () => {
    const eligible = resolveEligibleMentionRecipients({
      validRecipients: ['u1', 'u2'],
      preferenceRows: null,
      preferenceError: null,
    });
    expect(eligible).toEqual(['u1', 'u2']);
  });
});
