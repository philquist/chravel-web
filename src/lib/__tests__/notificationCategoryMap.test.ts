import {
  NOTIFICATION_CATEGORY_MAP,
  NOTIFICATION_TYPE_TO_CATEGORY_KEY,
  resolveNotificationCategoryByType,
} from '../notifications/categoryMap';

describe('notification category map', () => {
  it('maps each notification type to exactly one category and preference key', () => {
    const seenTypes = new Set<string>();

    for (const category of Object.values(NOTIFICATION_CATEGORY_MAP)) {
      for (const type of category.backendNotificationTypes) {
        const normalized = type.toLowerCase();
        expect(seenTypes.has(normalized)).toBe(false);
        seenTypes.add(normalized);

        const resolved = resolveNotificationCategoryByType(type);
        expect(resolved).not.toBeNull();
        expect(resolved?.key).toBe(category.key);
        expect(resolved?.preferenceKey).toBe(category.preferenceKey);
      }
    }
  });

  it('includes explicit broadcasts_and_pins and mention fallback messages mapping', () => {
    const broadcastAndPins = NOTIFICATION_CATEGORY_MAP.broadcasts_and_pins;
    expect(broadcastAndPins.preferenceKey).toBe('broadcasts');
    expect(broadcastAndPins.backendNotificationTypes).toEqual(
      expect.arrayContaining(['broadcast', 'pin', 'pin_announcement']),
    );

    const messages = NOTIFICATION_CATEGORY_MAP.messages;
    expect(messages.preferenceKey).toBe('chat_messages');
    expect(messages.messagesScope).toBe('mentions_only_fallback');
    expect(messages.backendNotificationTypes).toContain('mention');
  });

  it('maps pin notifications to the broadcasts preference', () => {
    const resolved = resolveNotificationCategoryByType('pin');
    expect(resolved?.preferenceKey).toBe('broadcasts');
    expect(resolved?.key).toBe('broadcasts_and_pins');
  });

  it('keeps notification type lookup table one-to-one with category registry', () => {
    const categoryTypesCount = Object.values(NOTIFICATION_CATEGORY_MAP).reduce(
      (count, category) => count + category.backendNotificationTypes.length,
      0,
    );

    expect(Object.keys(NOTIFICATION_TYPE_TO_CATEGORY_KEY)).toHaveLength(categoryTypesCount);
  });
});
