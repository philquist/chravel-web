import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { userPreferencesService, NotificationPreferences } from '@/services/userPreferencesService';
import { useToast } from '@/hooks/use-toast';
import { usePushPreferenceToggle } from '@/hooks/usePushPreferenceToggle';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getTripNotificationPreferenceCategories } from '@/components/settings/tripNotificationPreferenceCategories';

export const EnterpriseNotificationsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { applyPushEnabled } = usePushPreferenceToggle();
  const { showDemoContent } = useDemoMode();
  const [_isLoading, setIsLoading] = useState(true);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>({
    broadcasts: true,
    chat: false,
    calendar: true,
    payments: true,
    tasks: true,
    polls: true,
    joinRequests: true,
    basecampUpdates: true,
    tripInvites: true,
    email: false,
    push: true,
    quietHours: false,
  });

  const [quietTimes, setQuietTimes] = useState({
    start: '22:00',
    end: '08:00',
  });

  const notificationCategories = useMemo(
    () => getTripNotificationPreferenceCategories({ includeTripInvites: true }),
    [],
  );

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      try {
        const prefs = await userPreferencesService.getNotificationPreferences(user.id);
        setNotificationSettings({
          broadcasts: prefs.broadcasts ?? true,
          chat: prefs.chat_messages ?? false,
          calendar: prefs.calendar_events ?? true,
          payments: prefs.payments ?? true,
          tasks: prefs.tasks ?? true,
          polls: prefs.polls ?? true,
          joinRequests: prefs.join_requests ?? true,
          basecampUpdates: prefs.basecamp_updates ?? true,
          tripInvites: prefs.trip_invites ?? true,
          email: prefs.email_enabled ?? false,
          push: prefs.push_enabled ?? true,
          quietHours: prefs.quiet_hours_enabled ?? false,
        });
        setQuietTimes({
          start: prefs.quiet_start || '22:00',
          end: prefs.quiet_end || '08:00',
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading notification preferences:', error);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, [user?.id]);

  const handleNotificationToggle = async (setting: string) => {
    const newValue = !notificationSettings[setting];

    if (showDemoContent) {
      setNotificationSettings(prev => ({ ...prev, [setting]: newValue }));
      return;
    }

    const keyMap: Record<string, keyof NotificationPreferences> = {
      broadcasts: 'broadcasts',
      chat: 'chat_messages',
      calendar: 'calendar_events',
      payments: 'payments',
      tasks: 'tasks',
      polls: 'polls',
      joinRequests: 'join_requests',
      basecampUpdates: 'basecamp_updates',
      tripInvites: 'trip_invites',
      email: 'email_enabled',
      push: 'push_enabled',
      quietHours: 'quiet_hours_enabled',
    };

    const dbKey = keyMap[setting];
    if (!dbKey) return;

    // Push: enabling must register a device token (native) or create a
    // web_push_subscriptions row (web/PWA), or the dispatcher has no target.
    if (setting === 'push' && user?.id) {
      setIsUpdatingPush(true);
      try {
        const result = await applyPushEnabled(newValue);
        if (result === 'permission_denied') {
          toast({
            title: 'Push notifications not enabled',
            description: 'Allow notifications for this app to receive alerts on this device.',
            variant: 'destructive',
          });
          return;
        }
        if (result === 'error') {
          toast({
            title: 'Error',
            description: 'Failed to update push notifications. Please try again.',
            variant: 'destructive',
          });
          return;
        }
        // 'ok' or 'unsupported' — record the preference.
        setNotificationSettings(prev => ({ ...prev, push: newValue }));
        await userPreferencesService.updateNotificationPreferences(user.id, { [dbKey]: newValue });
        return;
      } finally {
        setIsUpdatingPush(false);
      }
    }

    setNotificationSettings(prev => ({ ...prev, [setting]: newValue }));

    if (user?.id) {
      try {
        await userPreferencesService.updateNotificationPreferences(user.id, { [dbKey]: newValue });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error saving notification preference:', error);
        }
        setNotificationSettings(prev => ({ ...prev, [setting]: !newValue }));
        toast({
          title: 'Error',
          description: 'Failed to save preference. Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleQuietTimeChange = async (field: 'start' | 'end', value: string) => {
    setQuietTimes(prev => ({ ...prev, [field]: value }));
    if (showDemoContent) return;
    if (user?.id) {
      try {
        const updates: Partial<NotificationPreferences> = {
          [field === 'start' ? 'quiet_start' : 'quiet_end']: value,
        };
        await userPreferencesService.updateNotificationPreferences(user.id, updates);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error saving quiet time:', error);
        }
      }
    }
  };

  const renderToggle = (key: string, isEnabled: boolean, isDisabled?: boolean) => (
    <button
      onClick={() => handleNotificationToggle(key)}
      disabled={isDisabled}
      aria-checked={isEnabled}
      role="switch"
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        isEnabled ? 'bg-green-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
          isEnabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-2xl font-bold text-white flex items-center gap-2">
        <Bell size={24} className="text-primary" />
        Notification Preferences
      </h3>

      {/* App Notification Categories */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">App Notifications</h4>
        <p className="text-sm text-gray-400 mb-2">
          Choose which types of notifications you want to receive
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Broadcasts and pins use the first toggle. Trip chat is separate so you can follow every
          message or keep chat silent.
        </p>

        <div className="space-y-3" data-testid="trip-notification-preference-rows">
          {notificationCategories.map(category => (
            <div
              key={category.key}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
            >
              <div className="flex items-center gap-3">
                {category.icon}
                <div>
                  <span className="text-white font-medium">{category.label}</span>
                  <p className="text-sm text-gray-400">{category.description}</p>
                </div>
              </div>
              {renderToggle(category.key, notificationSettings[category.key] ?? true)}
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Methods */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Delivery Methods</h4>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <Bell size={16} className="text-primary" />
              <div>
                <span className="text-white font-medium">Push Notifications</span>
                <p className="text-sm text-gray-400">Real-time notifications on your device</p>
              </div>
            </div>
            {renderToggle('push', notificationSettings.push, isUpdatingPush)}
          </div>

          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-blue-400" />
              <div>
                <span className="text-white font-medium">Email Notifications</span>
                <p className="text-sm text-gray-400">Receive notifications via email</p>
              </div>
            </div>
            {renderToggle('email', notificationSettings.email)}
          </div>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Quiet Hours</h4>

        <div className="space-y-3">
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-medium">Enable Quiet Hours</div>
              {renderToggle('quietHours', notificationSettings.quietHours)}
            </div>
            {notificationSettings.quietHours && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Start Time</label>
                  <input
                    type="time"
                    value={quietTimes.start}
                    onChange={e => handleQuietTimeChange('start', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">End Time</label>
                  <input
                    type="time"
                    value={quietTimes.end}
                    onChange={e => handleQuietTimeChange('end', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
