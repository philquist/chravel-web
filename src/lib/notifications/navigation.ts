import type {
  NotificationIngestionRow,
  NotificationNavigationContract,
  NotificationChannelType,
  NotificationPayload,
  NotificationPayloadMetadata,
  NotificationTab,
  NotificationType,
} from '@/types/notifications';

const NOTIFICATION_TAB_BY_TYPE: Partial<Record<NotificationType, NotificationTab>> = {
  mention: 'chat',
  message: 'chat',
  chat: 'chat',
  broadcast: 'broadcasts',
  calendar: 'calendar',
  task: 'tasks',
  payment: 'payments',
  poll: 'polls',
  photos: 'media',
  join_request: 'collaborators',
  basecamp: 'places',
};

const ALLOWED_TABS = new Set<NotificationTab>([
  'chat',
  'broadcasts',
  'calendar',
  'payments',
  'tasks',
  'polls',
  'media',
  'collaborators',
  'places',
]);

const ALLOWED_CHANNELS = new Set<NotificationChannelType>([
  'chat',
  'messages',
  'broadcasts',
  'system',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

export function parseNotificationMetadata(raw: unknown): NotificationPayloadMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const tab = asString(obj.tab)?.toLowerCase() as NotificationTab | undefined;
  const channelType = asString(obj.channel_type)?.toLowerCase() as
    | NotificationChannelType
    | undefined;

  return {
    ...obj,
    trip_id: asString(obj.trip_id),
    trip_type: asString(obj.trip_type),
    trip_name: asString(obj.trip_name),
    tab: tab && ALLOWED_TABS.has(tab) ? tab : undefined,
    channel_type: channelType && ALLOWED_CHANNELS.has(channelType) ? channelType : undefined,
    message_id: asString(obj.message_id),
    stream_message_id: asString(obj.stream_message_id),
    chat_message_id: asString(obj.chat_message_id),
    channel_id: asString(obj.channel_id),
    stream_channel_id: asString(obj.stream_channel_id),
    chat_channel_id: asString(obj.chat_channel_id),
    stream_channel_type: asString(obj.stream_channel_type),
    thread_id: asString(obj.thread_id),
    request_id: asString(obj.request_id),
    join_request_id: asString(obj.join_request_id),
    action: asString(obj.action),
  };
}

export function resolveNotificationTab(
  notification: Pick<NotificationPayload, 'type'>,
  metadata: NotificationPayloadMetadata,
): NotificationTab | null {
  return resolveNotificationNavigation(notification, metadata).tab;
}

export function resolveNotificationNavigation(
  notification: Pick<NotificationPayload, 'type'>,
  metadata: NotificationPayloadMetadata,
): NotificationNavigationContract {
  const tab =
    metadata.tab ??
    (metadata.channel_type === 'chat' || metadata.channel_type === 'messages'
      ? 'chat'
      : (NOTIFICATION_TAB_BY_TYPE[notification.type] ?? null));

  return {
    tab,
    shouldHandshakeChat: tab === 'chat' || notification.type === 'mention',
  };
}

export function parseNotificationIngestionRow(raw: unknown): NotificationIngestionRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = asString(row.id);
  const type = asString(row.type) as NotificationType | undefined;
  const title = asString(row.title);
  const message = asString(row.message);
  const createdAt = asString(row.created_at);

  if (!id || !type || !title || !message || !createdAt) return null;

  return {
    id,
    type,
    title,
    message,
    is_read: row.is_read === true,
    trip_id: asString(row.trip_id) ?? null,
    created_at: createdAt,
    metadata: row.metadata,
  };
}
