import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollStorageService } from '@/services/pollStorageService';

const storage = new Map<string, unknown>();

vi.mock('@/platform/storage', () => ({
  getStorageItem: vi.fn(async (key: string, fallback: unknown) => storage.get(key) ?? fallback),
  setStorageItem: vi.fn(async (key: string, value: unknown) => {
    storage.set(key, value);
  }),
  removeStorageItem: vi.fn(async (key: string) => {
    storage.delete(key);
  }),
}));

describe('pollStorageService.appendOption', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('appends an option to a demo-created poll without touching mockPolls', async () => {
    const created = await pollStorageService.createPoll('trip-1', {
      question: 'Dinner?',
      options: ['Sushi', 'Tacos'],
    });

    const updated = await pollStorageService.appendOption('trip-1', created.id, 'Ramen');
    expect(updated?.options).toHaveLength(3);
    expect(updated?.options[2]?.text).toBe('Ramen');
    expect(updated?.options[2]?.votes).toBe(0);
  });

  it('rejects duplicate option text', async () => {
    const created = await pollStorageService.createPoll('trip-1', {
      question: 'Dinner?',
      options: ['Sushi', 'Tacos'],
    });
    await expect(pollStorageService.appendOption('trip-1', created.id, 'sushi')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('returns null for unknown poll ids (mock polls stay untouched)', async () => {
    await expect(
      pollStorageService.appendOption('trip-1', 'mock-poll-1-1', 'Ramen'),
    ).resolves.toBeNull();
  });
});
