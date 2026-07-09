import { describe, expect, it } from 'vitest';

import {
  ACCEPTANCE_ACTION,
  BADGE_NOTIFICATION_TYPES,
  buildBadgeOrFilter,
  isBadgeCountable,
} from '../badgeCategories';

const CHAT_ON = { chat_messages: true };
const CHAT_OFF = { chat_messages: false };

describe('badgeCategories', () => {
  describe('isBadgeCountable', () => {
    it('counts broadcasts and basecamp updates', () => {
      expect(isBadgeCountable({ type: 'broadcast' }, CHAT_OFF)).toBe(true);
      expect(isBadgeCountable({ type: 'basecamp' }, CHAT_OFF)).toBe(true);
      expect(isBadgeCountable({ type: 'basecamp_update' }, CHAT_OFF)).toBe(true);
      expect(isBadgeCountable({ type: 'trip_update' }, CHAT_OFF)).toBe(true);
    });

    it('counts @mentions and new member joins regardless of the chat preference', () => {
      expect(isBadgeCountable({ type: 'mention' }, CHAT_OFF)).toBe(true);
      expect(isBadgeCountable({ type: 'mention' }, CHAT_ON)).toBe(true);
      expect(isBadgeCountable({ type: 'member_joined' }, CHAT_OFF)).toBe(true);
      expect(isBadgeCountable({ type: 'member_joined' }, CHAT_ON)).toBe(true);
    });

    it('counts chat messages only when the chat preference is on', () => {
      expect(isBadgeCountable({ type: 'chat_message' }, CHAT_ON)).toBe(true);
      expect(isBadgeCountable({ type: 'chat_message' }, CHAT_OFF)).toBe(false);
    });

    it('counts trip acceptance via metadata.action even when type is the generic "success"', () => {
      // approve_join_request RPC writes type='success' + metadata.action='join_approved'.
      expect(
        isBadgeCountable({ type: 'success', metadata: { action: 'join_approved' } }, CHAT_OFF),
      ).toBe(true);
    });

    it('counts trip acceptance from the alternate writer that sets type="join_approved"', () => {
      // edge approve-join-request writes type='join_approved' without metadata.action.
      expect(isBadgeCountable({ type: 'join_approved' }, CHAT_OFF)).toBe(true);
    });

    it('does NOT count polls, tasks, calendar, or payments', () => {
      expect(isBadgeCountable({ type: 'poll_vote' }, CHAT_ON)).toBe(false);
      expect(isBadgeCountable({ type: 'task_assigned' }, CHAT_ON)).toBe(false);
      expect(isBadgeCountable({ type: 'calendar_event' }, CHAT_ON)).toBe(false);
      expect(isBadgeCountable({ type: 'payment_request' }, CHAT_ON)).toBe(false);
    });

    it('handles missing/odd metadata without throwing', () => {
      expect(isBadgeCountable({ type: 'success' }, CHAT_OFF)).toBe(false);
      expect(isBadgeCountable({ type: 'success', metadata: null }, CHAT_OFF)).toBe(false);
      expect(
        isBadgeCountable({ type: undefined, metadata: { action: 'join_approved' } }, CHAT_OFF),
      ).toBe(true);
    });
  });

  describe('buildBadgeOrFilter', () => {
    it('includes chat_message only when chat is enabled', () => {
      expect(buildBadgeOrFilter(true)).toContain('chat_message');
      expect(buildBadgeOrFilter(false)).not.toContain('chat_message');
    });

    it('always matches the acceptance action via metadata', () => {
      expect(buildBadgeOrFilter(false)).toContain(`metadata->>action.eq.${ACCEPTANCE_ACTION}`);
    });

    it('emits a valid PostgREST or() shape', () => {
      const filter = buildBadgeOrFilter(false);
      expect(filter).toMatch(/^type\.in\.\([^)]+\),metadata->>action\.eq\.join_approved$/);
    });
  });

  it('exposes the canonical badge type list', () => {
    expect(BADGE_NOTIFICATION_TYPES).toContain('broadcast');
    expect(BADGE_NOTIFICATION_TYPES).toContain('chat_message');
    expect(BADGE_NOTIFICATION_TYPES).toContain('basecamp_update');
    expect(BADGE_NOTIFICATION_TYPES).toContain('mention');
    expect(BADGE_NOTIFICATION_TYPES).toContain('member_joined');
  });
});
