import { describe, it, expect, vi, beforeEach } from 'vitest';

import { deleteAccountImmediately } from '../accountDeletion';

const mockGetSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
  SUPABASE_PROJECT_URL: 'https://example.supabase.co',
  SUPABASE_PUBLIC_ANON_KEY: 'anon-key',
}));

describe('deleteAccountImmediately', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Your account and data have been permanently deleted.',
        }),
      }),
    );
  });

  it('returns an error when there is no active session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const result = await deleteAccountImmediately();

    expect(result).toEqual({
      success: false,
      error: 'Your session expired. Please sign in again and retry.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the delete-account edge function with the user JWT', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token' } },
      error: null,
    });

    const result = await deleteAccountImmediately();

    expect(fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/delete-account',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
          apikey: 'anon-key',
        }),
        body: JSON.stringify({ confirmation: 'DELETE' }),
      }),
    );
    expect(result).toEqual({
      success: true,
      message: 'Your account and data have been permanently deleted.',
    });
  });

  it('returns a network error when fetch throws', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token' } },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await deleteAccountImmediately();

    expect(result).toEqual({
      success: false,
      error: 'Network error. Please check your connection and retry.',
    });
  });
});
