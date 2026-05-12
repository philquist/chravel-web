export interface NotificationPreferencesContract {
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  messages: boolean;
  broadcasts_and_pins: boolean;
  tasks: boolean;
  payments: boolean;
  calendar_events: boolean;
  polls: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES_CONTRACT: NotificationPreferencesContract = {
  push_enabled: true,
  email_enabled: false,
  sms_enabled: false,
  messages: false,
  broadcasts_and_pins: true,
  tasks: true,
  payments: true,
  calendar_events: true,
  polls: true,
};

export type NotificationPreferenceKey = keyof NotificationPreferencesContract;
