import React, { useState, useEffect } from 'react';
import { Bell, Mail, Radio, Calendar, CheckSquare, BarChart2, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { userPreferencesService, NotificationPreferences } from '@/services/userPreferencesService';
import { useToast } from '@/hooks/use-toast';
import { usePushPreferenceToggle } from '@/hooks/usePushPreferenceToggle';
import { useDemoMode } from '@/hooks/useDemoMode';

interface EventNotificationCategory {
  key: string;
  dbKey: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EVENT_NOTIFICATION_CATEGORIES: EventNotificationCategory[] = [
  {
    key: 'broadcasts',
    dbKey: 'broadcasts',
    label: 'Event Announcements',
    description: 'Receive important announcements from event organizers',
    icon: <Radio size={16} className="text-red-400" />,
  },
  {
    key: 'calendar',
    dbKey: 'calendar_events',
    label: 'Agenda & Reminders',
    description: 'Get notified when the schedule changes or event reminders',
    icon: <Calendar size={16} className="text-purple-400" />,
  },
  {
    key: 'joinRequests',
    dbKey: 'join_requests',
    label: 'RSVP & New Attendees',
    description: 'Get notified when attendees RSVP or join the event',
    icon: <UserPlus size={16} className="text-orange-400" />,
  },
  {
    key: 'tasks',
    dbKey: 'tasks',
    label: 'Task Assignments',
    description: 'Get notified when tasks are assigned or completed',
    icon: <CheckSquare size={16} className="text-yellow-400" />,
  },
  {
    key: 'polls',
    dbKey: 'polls',
    label: 'Polls',
    description: 'Get notified when new polls are created',
    icon: <BarChart2 size={16} className="text-cyan-400" />,
  },
];

export const EventNotificationsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { applyPushEnabled } = usePushPreferenceToggle();
  const { showDemoContent } = useDemoMode();
  const [isLoading, setIsLoading] = useState(true);
  const [hasHydratedPreferences, setHasHydratedPreferences] = useState(false);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean | null>>({
    broadcasts: null,
    calendar: null,
    joinRequests: null,
    tasks: null,
    polls: null,
    email: null,
    push: null,
  });

  useEffect(() => {
    let cancelled = false;
    const timeoutMs = 15_000;

    const loadPreferences = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('notification_preferences_fetch_timeout')),
          timeoutMs,
        );
      });

      try {
        const fetchPromise = userPreferencesService
          .getNotificationPreferences(user.id)
          .finally(() => {
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
            }
          });

        const prefs = await Promise.race([fetchPromise, timeoutPromise]);

        if (cancelled) return;

        setNotificationSettings({
          broadcasts: prefs.broadcasts ?? true,
          calendar: prefs.calendar_events ?? true,
          joinRequests: prefs.join_requests ?? true,
          tasks: prefs.tasks ?? true,
          polls: prefs.polls ?? true,
          email: prefs.email_enabled ?? false,
          push: prefs.push_enabled ?? true,
        });
        setHasHydratedPreferences(true);
      } catch (error) {
        if (import.meta.env.DEV) {
          if (
            error instanceof Error &&
            error.message === 'notification_preferences_fetch_timeout'
          ) {
            console.warn(
              'Notification preferences fetch timed out; showing defaults until next load.',
            );
          } else {
            console.error('Error loading notification preferences:', error);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleNotificationToggle = async (setting: string) => {
    if (!hasHydratedPreferences) return;

    const currentValue = notificationSettings[setting];
    if (typeof currentValue !== 'boolean') return;

    const newValue = !currentValue;

    if (showDemoContent) {
      setNotificationSettings(prev => ({ ...prev, [setting]: newValue }));
      return;
    }

    const categoryMap: Record<string, keyof NotificationPreferences> = {
      broadcasts: 'broadcasts',
      calendar: 'calendar_events',
      joinRequests: 'join_requests',
      tasks: 'tasks',
      polls: 'polls',
      email: 'email_enabled',
      push: 'push_enabled',
    };

    const dbKey = categoryMap[setting];
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

  const renderToggle = (key: string, isEnabled: boolean | null, isDisabled?: boolean) => (
    <button
      onClick={() => handleNotificationToggle(key)}
      disabled={isDisabled || !hasHydratedPreferences || isEnabled === null}
      aria-checked={isEnabled === true}
      aria-label={`Toggle ${key} notifications`}
      role="switch"
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        isEnabled === true ? 'bg-green-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
          isEnabled === true ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-2xl font-bold text-white flex items-center gap-2">
        <Bell size={24} className="text-primary" />
        Event Notifications
      </h3>
      <p className="text-gray-300">
        Manage how you receive updates about events you attend or organize
      </p>
      {!hasHydratedPreferences && (
        <div
          className="flex items-center gap-2 text-sm text-gray-400"
          role="status"
          aria-live="polite"
        >
          {isLoading && <div className="h-4 w-4 animate-spin gold-gradient-spinner" />}
          <span>Loading your saved notification preferences…</span>
        </div>
      )}

      {/* Event Categories */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Event Notifications</h4>
        <p className="text-sm text-gray-400 mb-4">
          Choose which types of event updates you want to receive
        </p>

        <div className="space-y-3">
          {EVENT_NOTIFICATION_CATEGORIES.map(category => (
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
        <p className="text-sm text-gray-400 mb-4">
          Choose how you receive event notifications (Push, Email)
        </p>

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
                <p className="text-sm text-gray-400">Receive event notifications via email</p>
              </div>
            </div>
            {renderToggle('email', notificationSettings.email)}
          </div>
        </div>
      </div>
    </div>
  );
};
