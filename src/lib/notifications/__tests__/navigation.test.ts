import { describe, expect, it } from 'vitest';
import { parseNotificationMetadata, resolveNotificationTab } from '../navigation';

describe('notification navigation metadata parser', () => {
  it('normalizes canonical metadata keys', () => {
    const metadata = parseNotificationMetadata({
      trip_id: 'trip-1',
      tab: 'calendar',
      channel_type: 'chat',
      message_id: 'msg-1',
    });

    expect(metadata.trip_id).toBe('trip-1');
    expect(metadata.tab).toBe('calendar');
    expect(metadata.channel_type).toBe('chat');
    expect(metadata.message_id).toBe('msg-1');
  });

  it('drops invalid tab and channel_type values', () => {
    const metadata = parseNotificationMetadata({ tab: 'unknown', channel_type: 'voice' });
    expect(metadata.tab).toBeUndefined();
    expect(metadata.channel_type).toBeUndefined();
  });
});

describe('resolveNotificationTab', () => {
  it('resolves broadcasts and pins to broadcasts tab', () => {
    expect(resolveNotificationTab({ type: 'broadcast' }, {})).toBe('broadcasts');
  });

  it('resolves calendar notifications to calendar tab', () => {
    expect(resolveNotificationTab({ type: 'calendar' }, {})).toBe('calendar');
  });

  it('resolves payments notifications to payments tab', () => {
    expect(resolveNotificationTab({ type: 'payment' }, {})).toBe('payments');
  });

  it('resolves task notifications to tasks tab', () => {
    expect(resolveNotificationTab({ type: 'task' }, {})).toBe('tasks');
  });

  it('resolves poll notifications to polls tab', () => {
    expect(resolveNotificationTab({ type: 'poll' }, {})).toBe('polls');
  });

  it('uses metadata tab override when valid', () => {
    expect(resolveNotificationTab({ type: 'system' }, { tab: 'payments' })).toBe('payments');
  });

  it('resolves channel_type chat metadata to chat tab', () => {
    expect(resolveNotificationTab({ type: 'system' }, { channel_type: 'chat' })).toBe('chat');
  });
});
