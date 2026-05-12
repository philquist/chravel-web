import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationPreferences } from '../useNotificationPreferences';

const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/userPreferencesService', () => ({
  userPreferencesService: {
    getNotificationPreferences: (...args: unknown[]) => mockGet(...args),
    updateNotificationPreferences: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads canonical preferences and rolls back optimistic update on save failure', async () => {
    mockGet.mockResolvedValue({
      push_enabled: true,
      email_enabled: false,
      sms_enabled: false,
      chat_messages: false,
      broadcasts: true,
      tasks: true,
      payments: true,
      calendar_events: true,
      polls: true,
    });
    mockUpdate.mockRejectedValue(new Error('save failed'));

    const { result } = renderHook(() => useNotificationPreferences());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences.messages).toBe(false);

    await act(async () => {
      const ok = await result.current.updatePreference('messages', true);
      expect(ok).toBe(false);
    });

    expect(result.current.preferences.messages).toBe(false);
    expect(result.current.error).toBe('Failed to update notification preferences');
  });
});
