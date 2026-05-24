export type NotificationPreferenceRow = {
  user_id: string;
  mentions_only: boolean | null;
  chat_messages: boolean | null;
};

type BuildMentionRowsInput = {
  recipientIds: string[];
  senderName: string | undefined;
  messageText: string | undefined;
  messageId: string;
  eventType: string;
  webhookId: string | null;
  channelType: string;
  channelId: string;
  tripId: string | null;
};

export function filterMentionRecipientsByPreferences(
  recipientIds: string[],
  preferenceRows: NotificationPreferenceRow[],
): string[] {
  const prefsMap = new Map(preferenceRows.map(pref => [pref.user_id, pref]));
  return recipientIds.filter(userId => {
    const pref = prefsMap.get(userId);
    if (!pref) return true;
    return pref.mentions_only !== false || pref.chat_messages === true;
  });
}

export function resolveEligibleMentionRecipients(params: {
  validRecipients: string[];
  preferenceRows: NotificationPreferenceRow[] | null;
  preferenceError: { message: string } | null;
}): string[] {
  if (params.preferenceError) return [];
  if (!params.preferenceRows) return params.validRecipients;
  return filterMentionRecipientsByPreferences(params.validRecipients, params.preferenceRows);
}

export function buildMentionNotificationRows(
  input: BuildMentionRowsInput,
): Array<Record<string, unknown>> {
  return input.recipientIds.map(userId => ({
    user_id: userId,
    type: 'mention' as const,
    title: input.senderName || 'New message',
    message: input.messageText || '',
    trip_id: input.tripId,
    metadata: {
      source: 'stream-webhook',
      stream_message_id: input.messageId,
      stream_event_type: input.eventType,
      stream_webhook_id: input.webhookId,
      stream_channel_type: input.channelType,
      stream_channel_id: input.channelId,
    },
  }));
}
