import type { NotificationPreferences } from '@/services/userPreferencesService';

export type NotificationPreferenceKey = keyof Pick<
  NotificationPreferences,
  | 'chat_messages'
  | 'broadcasts'
  | 'calendar_events'
  | 'payments'
  | 'tasks'
  | 'polls'
  | 'trip_invites'
  | 'join_requests'
  | 'basecamp_updates'
>;

export type NotificationDeepLinkTab =
  | 'chat'
  | 'broadcasts'
  | 'calendar'
  | 'tasks'
  | 'payments'
  | 'polls'
  | 'media'
  | 'collaborators'
  | 'places';

export type NotificationCategoryKey =
  | 'messages'
  | 'broadcasts_and_pins'
  | 'calendar'
  | 'payments'
  | 'tasks'
  | 'polls'
  | 'trip_invites'
  | 'join_requests'
  | 'basecamp_updates'
  | 'media';

export interface NotificationCategoryDefinition {
  key: NotificationCategoryKey;
  uiLabel: string;
  preferenceKey: NotificationPreferenceKey;
  backendNotificationTypes: string[];
  /** Alias of backendNotificationTypes for legacy callers/tests. */
  backendTypes?: string[];
  /** Alias of key for legacy callers/tests. */
  category?: NotificationCategoryKey;
  deepLinkTab?: NotificationDeepLinkTab;
  messagesScope?: 'all_chat' | 'mentions_only_fallback';
}

export const NOTIFICATION_CATEGORY_MAP: Record<
  NotificationCategoryKey,
  NotificationCategoryDefinition
> = {
  messages: {
    key: 'messages',
    uiLabel: 'Messages',
    preferenceKey: 'chat_messages',
    backendNotificationTypes: ['message', 'chat', 'chat_message', 'chat_messages', 'mention'],
    deepLinkTab: 'chat',
    messagesScope: 'mentions_only_fallback',
  },
  broadcasts_and_pins: {
    key: 'broadcasts_and_pins',
    uiLabel: 'Broadcasts & Pins',
    preferenceKey: 'broadcasts',
    backendNotificationTypes: [
      'broadcast',
      'broadcasts',
      'broadcast_posted',
      'pin',
      'pin_announcement',
    ],
    deepLinkTab: 'broadcasts',
  },
  calendar: {
    key: 'calendar',
    uiLabel: 'Calendar Events',
    preferenceKey: 'calendar_events',
    backendNotificationTypes: [
      'calendar',
      'calendar_events',
      'calendar_reminder',
      'event',
      'itinerary_update',
    ],
    deepLinkTab: 'calendar',
  },
  payments: {
    key: 'payments',
    uiLabel: 'Payments',
    preferenceKey: 'payments',
    backendNotificationTypes: [
      'payment',
      'payments',
      'payment_request',
      'payment_split',
      'payment_alert',
    ],
    deepLinkTab: 'payments',
  },
  tasks: {
    key: 'tasks',
    uiLabel: 'Tasks',
    preferenceKey: 'tasks',
    backendNotificationTypes: ['task', 'tasks', 'task_assigned'],
    deepLinkTab: 'tasks',
  },
  polls: {
    key: 'polls',
    uiLabel: 'Polls',
    preferenceKey: 'polls',
    backendNotificationTypes: ['poll', 'polls', 'poll_vote', 'poll_created'],
    deepLinkTab: 'polls',
  },
  trip_invites: {
    key: 'trip_invites',
    uiLabel: 'Trip Invites',
    preferenceKey: 'trip_invites',
    backendNotificationTypes: ['invite', 'trip_invite', 'trip_invites'],
  },
  join_requests: {
    key: 'join_requests',
    uiLabel: 'Join Requests',
    preferenceKey: 'join_requests',
    backendNotificationTypes: [
      'join_request',
      'join_requests',
      'member_joined',
      'join_approved',
      'join_rejected',
    ],
    deepLinkTab: 'collaborators',
  },
  basecamp_updates: {
    key: 'basecamp_updates',
    uiLabel: 'Basecamp Updates',
    preferenceKey: 'basecamp_updates',
    backendNotificationTypes: ['basecamp', 'basecamp_updates', 'trip_update'],
    deepLinkTab: 'places',
  },
  media: {
    key: 'media',
    uiLabel: 'Media',
    preferenceKey: 'chat_messages',
    backendNotificationTypes: ['photos', 'files'],
    deepLinkTab: 'media',
  },
};

// Hydrate legacy aliases (`backendTypes`, `category`) for callers/tests that use them.
Object.values(NOTIFICATION_CATEGORY_MAP).forEach(def => {
  def.backendTypes = def.backendNotificationTypes;
  def.category = def.key;
});

const TYPE_TO_CATEGORY_ENTRIES = Object.values(NOTIFICATION_CATEGORY_MAP).flatMap(category =>
  category.backendNotificationTypes.map(type => [type.toLowerCase(), category.key] as const),
);

export const NOTIFICATION_TYPE_TO_CATEGORY_KEY: Record<string, NotificationCategoryKey> =
  Object.fromEntries(TYPE_TO_CATEGORY_ENTRIES);

export function resolveNotificationCategoryByType(
  type: string,
): NotificationCategoryDefinition | null {
  const key = NOTIFICATION_TYPE_TO_CATEGORY_KEY[type.toLowerCase()];
  return key ? NOTIFICATION_CATEGORY_MAP[key] : null;
}

export function resolveNotificationCategory(type: string): NotificationCategoryKey | null {
  return NOTIFICATION_TYPE_TO_CATEGORY_KEY[type.toLowerCase()] ?? null;
}

export function resolveNotificationTabFromType(type: string): NotificationDeepLinkTab | null {
  return resolveNotificationCategoryByType(type)?.deepLinkTab ?? null;
}
