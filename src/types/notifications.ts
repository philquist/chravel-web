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
  trip_id?: string;
  trip_type?: string;
  trip_name?: string;
  tab?: NotificationTab;
  channel_type?: NotificationChannelType;
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
