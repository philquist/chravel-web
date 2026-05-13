import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CATEGORY_MAP,
  resolveNotificationCategory,
} from '@/lib/notifications/categoryMap';
import type { NotificationType } from '@/types/notifications';

describe('notification category map', () => {
  it('maps each backend type to exactly one preference key and one UI category', () => {
    const seen = new Map<NotificationType, string>();

    Object.values(NOTIFICATION_CATEGORY_MAP).forEach(definition => {
      ((definition as any).backendTypes ?? definition.backendNotificationTypes).forEach((type: NotificationType) => {
        expect(seen.has(type)).toBe(false);
        seen.set(type, ((definition as any).category ?? definition.key) as string);
      });
    });

    seen.forEach((category, type) => {
      expect(resolveNotificationCategory(type)).toBe(category);
    });
  });

  it('includes combined broadcasts_and_pins and explicit messages mapping', () => {
    expect(NOTIFICATION_CATEGORY_MAP.broadcasts_and_pins.backendTypes).toContain('broadcast');
    expect(NOTIFICATION_CATEGORY_MAP.messages.backendTypes).toEqual(
      expect.arrayContaining(['message', 'chat', 'mention']),
    );
  });
});
