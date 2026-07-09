import { describe, expect, it } from 'vitest';
import {
  computeRetryPolicy,
  enforcePreferenceAtSendTime,
  routeChannels,
} from '../notificationDispatchPolicy.ts';
import type { NotificationPreferences } from '../notificationUtils.ts';

const prefs: NotificationPreferences = {
  user_id: 'user-1',
  push_enabled: true,
  email_enabled: true,
  chat_messages: false,
  mentions: true,
  broadcasts: true,
  calendar_events: true,
  calendar_bulk_import: true,
  payments: true,
  tasks: true,
  polls: true,
  trip_invites: true,
  join_requests: true,
  basecamp_updates: true,
  quiet_hours_enabled: false,
  quiet_start: '22:00',
  quiet_end: '08:00',
  timezone: 'America/Los_Angeles',
};

describe('notification dispatch policy', () => {
  it('routes eligible channels while enforcing preferences at send time', () => {
    expect(routeChannels('broadcasts', prefs)).toEqual(['push', 'email']);
  });

  it('blocks opted-out categories before send (opt-out compliance)', () => {
    const optedOutPrefs = { ...prefs, broadcasts: false };
    expect(enforcePreferenceAtSendTime('push', 'broadcasts', optedOutPrefs)).toEqual({
      allow: false,
      reason: 'category_disabled',
    });
  });

  it('provides retry/backoff and dead-letter for transient channel failures', () => {
    expect(computeRetryPolicy('email', 1, 503)).toEqual({
      retryable: true,
      nextAttemptMinutes: 1,
      deadLetter: false,
    });
    expect(computeRetryPolicy('email', 4, 503)).toEqual({
      retryable: false,
      nextAttemptMinutes: null,
      deadLetter: true,
    });
  });

  it('does not retry hard client failures', () => {
    expect(computeRetryPolicy('email', 1, 400)).toEqual({
      retryable: false,
      nextAttemptMinutes: null,
      deadLetter: true,
    });
  });
});
