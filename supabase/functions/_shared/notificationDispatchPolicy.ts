import {
  isEmailEligible,
  type NotificationCategory,
  type NotificationPreferences,
} from './notificationUtils.ts';

export type DeliveryChannel = 'push' | 'email';

export interface NotificationEventContract {
  eventId: string;
  notificationType: string;
  category: NotificationCategory | null;
  recipientUserId: string;
}

export interface DispatchDecision {
  allow: boolean;
  reason: 'ok' | 'category_disabled' | 'push_disabled' | 'email_disabled' | 'email_not_eligible';
}

export interface RetryPolicy {
  retryable: boolean;
  nextAttemptMinutes: number | null;
  deadLetter: boolean;
}

const EMAIL_RETRY_BACKOFF_MINUTES = [1, 5, 15] as const;
const PUSH_RETRY_BACKOFF_MINUTES = [1, 3, 10] as const;

const RETRY_BACKOFF_BY_CHANNEL: Record<DeliveryChannel, readonly number[]> = {
  email: EMAIL_RETRY_BACKOFF_MINUTES,
  push: PUSH_RETRY_BACKOFF_MINUTES,
};

export function routeChannels(
  category: NotificationCategory | null,
  prefs: NotificationPreferences,
): DeliveryChannel[] {
  const channels: DeliveryChannel[] = ['push'];
  if (category && isEmailEligible(category)) channels.push('email');

  return channels.filter(channel => enforcePreferenceAtSendTime(channel, category, prefs).allow);
}

export function enforcePreferenceAtSendTime(
  channel: DeliveryChannel,
  category: NotificationCategory | null,
  prefs: NotificationPreferences,
): DispatchDecision {
  if (category && prefs[category] !== true) return { allow: false, reason: 'category_disabled' };

  if (channel === 'push') {
    return prefs.push_enabled
      ? { allow: true, reason: 'ok' }
      : { allow: false, reason: 'push_disabled' };
  }

  // channel === 'email'
  if (!prefs.email_enabled) return { allow: false, reason: 'email_disabled' };
  if (category && !isEmailEligible(category)) return { allow: false, reason: 'email_not_eligible' };
  return { allow: true, reason: 'ok' };
}

export function computeRetryPolicy(
  channel: DeliveryChannel,
  attemptNumber: number,
  httpStatus?: number,
): RetryPolicy {
  const transient = httpStatus === undefined || httpStatus === 429 || httpStatus >= 500;
  if (!transient) return { retryable: false, nextAttemptMinutes: null, deadLetter: true };

  const backoff = RETRY_BACKOFF_BY_CHANNEL[channel];
  if (attemptNumber >= backoff.length + 1) {
    return { retryable: false, nextAttemptMinutes: null, deadLetter: true };
  }

  return {
    retryable: true,
    nextAttemptMinutes: backoff[attemptNumber - 1],
    deadLetter: false,
  };
}
