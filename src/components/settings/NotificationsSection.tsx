import React from 'react';
import { Bell } from 'lucide-react';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { NotificationPreferenceKey } from '@/types/notificationPreferences';

const TOGGLE_ORDER: NotificationPreferenceKey[] = [
  'push_enabled',
  'email_enabled',
  'broadcasts_and_pins',
  'messages',
  'calendar_events',
  'payments',
  'tasks',
  'polls',
];

export const NotificationsSection = () => {
  const { preferences, updatePreference, isLoading } = useNotificationPreferences();

  const handleNotificationToggle = (setting: NotificationPreferenceKey) => {
    const current = preferences[setting] ?? false;
    void updatePreference(setting, !current);
  };

  const labels: Record<NotificationPreferenceKey, string> = {
    messages: 'Trip chat (every new message)',
    broadcasts_and_pins: 'Broadcast and pinned messages',
    calendar_events: 'Calendar Events',
    payments: 'Payments',
    tasks: 'Tasks',
    polls: 'Polls',
    push_enabled: 'Push Notifications',
    email_enabled: 'Email Notifications',
  };

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-2xl font-bold text-white">Notification Preferences</h3>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">App Notifications</h4>
        <div className="space-y-3">
          {TOGGLE_ORDER.map(key => (
            <div
              key={key}
              className="flex items-center justify-between p-3 bg-white/5 rounded-xl min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <Bell size={16} className="text-gray-400" />
                <span className="text-white">{labels[key]}</span>
              </div>
              <button
                onClick={() => handleNotificationToggle(key)}
                aria-checked={Boolean(preferences[key])}
                role="switch"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  preferences[key] ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    preferences[key] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
