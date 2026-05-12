import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { userPreferencesService } from '@/services/userPreferencesService';
import {
  DEFAULT_NOTIFICATION_PREFERENCES_CONTRACT,
  NotificationPreferenceKey,
  NotificationPreferencesContract,
} from '@/types/notificationPreferences';

const mapDbToContract = (
  prefs: Awaited<ReturnType<typeof userPreferencesService.getNotificationPreferences>>,
) => ({
  push_enabled: prefs.push_enabled,
  email_enabled: prefs.email_enabled,
  sms_enabled: prefs.sms_enabled,
  messages: prefs.chat_messages,
  broadcasts_and_pins: prefs.broadcasts,
  tasks: prefs.tasks,
  payments: prefs.payments,
  calendar_events: prefs.calendar_events,
  polls: prefs.polls,
});

const mapContractToDb = (
  prefs: Partial<NotificationPreferencesContract>,
): Partial<Awaited<ReturnType<typeof userPreferencesService.getNotificationPreferences>>> => ({
  ...(prefs.push_enabled !== undefined && { push_enabled: prefs.push_enabled }),
  ...(prefs.email_enabled !== undefined && { email_enabled: prefs.email_enabled }),
  ...(prefs.sms_enabled !== undefined && { sms_enabled: prefs.sms_enabled }),
  ...(prefs.messages !== undefined && { chat_messages: prefs.messages }),
  ...(prefs.broadcasts_and_pins !== undefined && { broadcasts: prefs.broadcasts_and_pins }),
  ...(prefs.tasks !== undefined && { tasks: prefs.tasks }),
  ...(prefs.payments !== undefined && { payments: prefs.payments }),
  ...(prefs.calendar_events !== undefined && { calendar_events: prefs.calendar_events }),
  ...(prefs.polls !== undefined && { polls: prefs.polls }),
});

export const useNotificationPreferences = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferencesContract>(
    DEFAULT_NOTIFICATION_PREFERENCES_CONTRACT,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    if (!user?.id) {
      setPreferences(DEFAULT_NOTIFICATION_PREFERENCES_CONTRACT);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const prefs = await userPreferencesService.getNotificationPreferences(user.id);
      setPreferences(mapDbToContract(prefs));
    } catch (_error) {
      setError('Failed to load notification preferences');
      setPreferences(DEFAULT_NOTIFICATION_PREFERENCES_CONTRACT);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const updatePreference = useCallback(
    async (key: NotificationPreferenceKey, value: boolean) => {
      if (!user?.id) return false;

      const previous = preferences;
      const next = { ...preferences, [key]: value };
      setPreferences(next);
      setIsSaving(true);
      setError(null);

      try {
        await userPreferencesService.updateNotificationPreferences(
          user.id,
          mapContractToDb({ [key]: value }),
        );
        return true;
      } catch (_error) {
        setPreferences(previous);
        setError('Failed to update notification preferences');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [preferences, user?.id],
  );

  return { preferences, isLoading, isSaving, error, loadPreferences, updatePreference };
};
