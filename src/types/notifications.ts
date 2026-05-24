export type NotificationType =
  | 'message'
  | 'broadcast'
  | 'calendar'
  | 'poll'
  | 'files'
  | 'photos'
  | 'chat'
  | 'mention'
  | 'task'
  | 'payment'
  | 'invite'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'basecamp'
  | 'system';

export type NotificationTab =
  | 'chat'
  | 'broadcasts'
  | 'calendar'
  | 'payments'
  | 'tasks'
  | 'polls'
  | 'media'
  | 'collaborators'
  | 'places';

export type NotificationChannelType = 'chat' | 'messages' | 'broadcasts' | 'system';

export interface NotificationPayloadMetadata {
  /** Canonical trip identifier used for deep-link routing. */
  trip_id?: string;
  trip_type?: string;
  trip_name?: string;
  /** Canonical destination tab key for trip detail navigation. */
  tab?: NotificationTab;
  /** Canonical channel discriminator for chat/broadcast routing. */
  channel_type?: NotificationChannelType;
  /** Canonical message identifier for deep-link handoff into chat. */
  message_id?: string;
  stream_message_id?: string;
  chat_message_id?: string;
  channel_id?: string;
  stream_channel_id?: string;
  chat_channel_id?: string;
  stream_channel_type?: string;
  thread_id?: string;
  request_id?: string;
  join_request_id?: string;
  action?: string;
  [key: string]: unknown;
}

export interface NotificationNavigationContract {
  tab: NotificationTab | null;
  shouldHandshakeChat: boolean;
}

export interface NotificationIngestionRow {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  trip_id?: string | null;
  created_at: string;
  metadata?: unknown;
}

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  tripId: string;
  tripName: string;
  timestamp: string;
  isRead: boolean;
  isHighPriority?: boolean;
  data?: NotificationPayloadMetadata;
}

export interface ReadStateConsistencyContract {
  /** Canonical unread boolean used by both notifications and messaging badges. */
  isRead: boolean;
  /** Optional trip-scoped unread aggregate from same source as messaging counts. */
  unreadCount?: number;
  /** App-shell badge value must be computed from canonical unread rows only. */
  badgeCount?: number;
  /** Idempotency key for cross-channel dedupe + observability joins. */
  eventId?: string;
}
