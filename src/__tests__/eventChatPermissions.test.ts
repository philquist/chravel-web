import { describe, expect, it } from 'vitest';
import {
  EVENT_OPEN_CHAT_MAX_ATTENDEES,
  canEnableEveryoneChat,
  canPostInMainChat,
  resolveEffectiveMainChatMode,
} from '@/lib/eventChatPermissions';

describe('eventChatPermissions', () => {
  it('allows everyone mode for events at exactly 50 attendees', () => {
    expect(canEnableEveryoneChat('event', EVENT_OPEN_CHAT_MAX_ATTENDEES)).toBe(true);
    expect(resolveEffectiveMainChatMode('everyone', 'event', EVENT_OPEN_CHAT_MAX_ATTENDEES)).toBe(
      'everyone',
    );
  });

  it('keeps event chat open even above 50 attendees', () => {
    expect(canEnableEveryoneChat('event', EVENT_OPEN_CHAT_MAX_ATTENDEES + 1)).toBe(true);
    expect(
      resolveEffectiveMainChatMode('everyone', 'event', EVENT_OPEN_CHAT_MAX_ATTENDEES + 1),
    ).toBe('everyone');
  });

  it('allows attendee posting in large events', () => {
    const attendeeCanPost = canPostInMainChat({
      chatMode: 'everyone',
      tripType: 'event',
      attendeeCount: EVENT_OPEN_CHAT_MAX_ATTENDEES + 20,
      userRole: 'member',
      isLoading: false,
    });

    const adminCanPost = canPostInMainChat({
      chatMode: 'everyone',
      tripType: 'event',
      attendeeCount: EVENT_OPEN_CHAT_MAX_ATTENDEES + 20,
      userRole: 'admin',
      isLoading: false,
    });

    expect(attendeeCanPost).toBe(true);
    expect(adminCanPost).toBe(true);
  });

  it('treats null chat_mode as open chat for non-event trips', () => {
    expect(resolveEffectiveMainChatMode(null, 'consumer', 4)).toBe('everyone');

    const memberCanPost = canPostInMainChat({
      chatMode: null,
      tripType: 'consumer',
      attendeeCount: 4,
      userRole: 'member',
      isLoading: false,
    });

    expect(memberCanPost).toBe(true);
  });

  it('treats broadcasts chat_mode as everyone for consumer trips (migration fix)', () => {
    // Migration 20260214211051 set DEFAULT 'broadcasts' for all trips.
    // Non-event trips should never be locked to broadcasts mode.
    expect(resolveEffectiveMainChatMode('broadcasts', 'consumer', 4)).toBe('everyone');
    expect(resolveEffectiveMainChatMode('broadcasts', 'pro', 10)).toBe('everyone');
    expect(resolveEffectiveMainChatMode('broadcasts', null, 4)).toBe('everyone');
  });

  it('normalizes broadcasts mode to everyone for event trips', () => {
    expect(resolveEffectiveMainChatMode('broadcasts', 'event', 30)).toBe('everyone');
  });

  it('treats broadcasts as everyone when DB says event but UI shell is consumer/pro', () => {
    expect(resolveEffectiveMainChatMode('broadcasts', 'event', 30, false)).toBe('everyone');

    const memberCanPost = canPostInMainChat({
      chatMode: 'broadcasts',
      tripType: 'event',
      attendeeCount: 30,
      userRole: 'member',
      isLoading: false,
      surfaceIsEvent: false,
    });

    expect(memberCanPost).toBe(true);
  });

  it('forces everyone mode on event shell even if trip_type row is wrong', () => {
    expect(resolveEffectiveMainChatMode('broadcasts', 'consumer', 4, true)).toBe('everyone');
  });

  it('allows consumer trip member to post even if chat_mode is broadcasts', () => {
    const memberCanPost = canPostInMainChat({
      chatMode: 'broadcasts',
      tripType: 'consumer',
      attendeeCount: 4,
      userRole: 'member',
      isLoading: false,
    });

    expect(memberCanPost).toBe(true);
  });

  it('allows non-admin posting in event with broadcasts mode value', () => {
    const memberCanPost = canPostInMainChat({
      chatMode: 'broadcasts',
      tripType: 'event',
      attendeeCount: 30,
      userRole: 'member',
      isLoading: false,
    });

    const adminCanPost = canPostInMainChat({
      chatMode: 'broadcasts',
      tripType: 'event',
      attendeeCount: 30,
      userRole: 'admin',
      isLoading: false,
    });

    expect(memberCanPost).toBe(true);
    expect(adminCanPost).toBe(true);
  });

  it('optimistically allows posting while loading when effective mode is everyone', () => {
    expect(
      canPostInMainChat({
        chatMode: null,
        tripType: 'consumer',
        attendeeCount: 0,
        userRole: null,
        isLoading: true,
      }),
    ).toBe(true);

    expect(
      canPostInMainChat({
        chatMode: 'everyone',
        tripType: 'consumer',
        attendeeCount: 4,
        userRole: null,
        isLoading: true,
      }),
    ).toBe(true);
  });

  it('allows optimistic posting while loading on consumer/pro shell even if row is event+broadcasts', () => {
    expect(
      canPostInMainChat({
        chatMode: 'broadcasts',
        tripType: 'event',
        attendeeCount: 30,
        userRole: null,
        isLoading: true,
        surfaceIsEvent: false,
      }),
    ).toBe(true);
  });

  it('does not optimistically allow posting while loading for restricted non-event modes', () => {
    expect(
      canPostInMainChat({
        chatMode: 'broadcasts',
        tripType: 'event',
        attendeeCount: 30,
        userRole: null,
        isLoading: true,
      }),
    ).toBe(true);

    expect(
      canPostInMainChat({
        chatMode: 'admin_only',
        tripType: 'consumer',
        attendeeCount: 4,
        userRole: null,
        isLoading: true,
      }),
    ).toBe(false);
  });
});
