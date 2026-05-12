import type { NotificationPreferenceKey } from '@/types/notificationPreferences';
import type { NotificationTab, NotificationType } from '@/types/notifications';

export type NotificationCategoryKey = Exclude<
  NotificationPreferenceKey,
  'push_enabled' | 'email_enabled' | 'sms_enabled'
>;

export interface NotificationCategoryDefinition {
  category: NotificationCategoryKey;
  uiLabel: string;
  preferenceKey: NotificationCategoryKey;
  backendTypes: NotificationType[];
  defaultTab: NotificationTab | null;
}

/**
 * NOTE: `messages` covers chat + mention notifications.
 * Mention delivery can still occur in mention-only mode server-side as an explicit fallback.
 */
export const NOTIFICATION_CATEGORY_MAP: Record<
  NotificationCategoryKey,
  NotificationCategoryDefinition
> = {
  messages: {
    category: 'messages',
    uiLabel: 'Messages',
    preferenceKey: 'messages',
    backendTypes: ['message', 'chat', 'mention'],
    defaultTab: 'chat',
  },
  broadcasts_and_pins: {
    category: 'broadcasts_and_pins',
    uiLabel: 'Broadcasts & pins',
    preferenceKey: 'broadcasts_and_pins',
    backendTypes: ['broadcast'],
    defaultTab: 'broadcasts',
  },
  calendar_events: {
    category: 'calendar_events',
    uiLabel: 'Calendar events',
    preferenceKey: 'calendar_events',
    backendTypes: ['calendar'],
    defaultTab: 'calendar',
  },
  tasks: {
    category: 'tasks',
    uiLabel: 'Tasks',
    preferenceKey: 'tasks',
    backendTypes: ['task'],
    defaultTab: 'tasks',
  },
  payments: {
    category: 'payments',
    uiLabel: 'Payments',
    preferenceKey: 'payments',
    backendTypes: ['payment'],
    defaultTab: 'payments',
  },
  polls: {
    category: 'polls',
    uiLabel: 'Polls',
    preferenceKey: 'polls',
    backendTypes: ['poll'],
    defaultTab: 'polls',
  },
};

const TYPE_TO_CATEGORY = Object.values(NOTIFICATION_CATEGORY_MAP).reduce(
  (acc, definition) => {
    definition.backendTypes.forEach(type => {
      acc[type] = definition.category;
    });
    return acc;
  },
  {} as Partial<Record<NotificationType, NotificationCategoryKey>>,
);

export function resolveNotificationCategory(
  type: NotificationType,
): NotificationCategoryKey | null {
  return TYPE_TO_CATEGORY[type] ?? null;
}

export function resolveNotificationTabFromType(type: NotificationType): NotificationTab | null {
  const category = resolveNotificationCategory(type);
  return category ? NOTIFICATION_CATEGORY_MAP[category].defaultTab : null;
}
