import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { AuthProvider, useAuth } from '../useAuth';
import { isInstalledApp, isChravelNativeIOS } from '@/utils/platformDetection';
import { openInstalledAuthBrowser } from '@/utils/installedAuthBrowser';

vi.mock('@/utils/platformDetection', () => ({
  isInstalledApp: vi.fn(() => false),
  isChravelNativeIOS: vi.fn(() => false),
  isCapacitorNativeShell: vi.fn(() => false),
  isChravelNativeShell: vi.fn(() => false),
}));

vi.mock('@/utils/installedAuthBrowser', () => ({
  openInstalledAuthBrowser: vi.fn().mockResolvedValue({ strategy: 'native-bridge' }),
}));

const mockIsInstalledApp = vi.mocked(isInstalledApp);
const mockIsChravelNativeIOS = vi.mocked(isChravelNativeIOS);
const mockOpenInstalledAuthBrowser = vi.mocked(openInstalledAuthBrowser);

// Mock user and session data
const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  phone: '+1234567890',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const mockSession = {
  access_token:
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMH0.signature',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockUser,
};

// Create mock Supabase client using vi.hoisted to ensure it's available during mock hoisting
const { mockSupabaseClient } = vi.hoisted(() => {
  const createChainMock = () => {
    const chainMock: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: (value: { data: never[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
      ),
    };
    // Make all chain methods return the chain mock for chaining
    Object.keys(chainMock).forEach(key => {
      if (
        typeof chainMock[key] === 'function' &&
        key !== 'then' &&
        key !== 'single' &&
        key !== 'maybeSingle'
      ) {
        chainMock[key].mockReturnValue(chainMock);
      }
    });
    return chainMock;
  };

  return {
    mockSupabaseClient: {
      from: vi.fn(() => createChainMock()),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        signInWithOAuth: vi.fn(),
        signInWithIdToken: vi.fn().mockResolvedValue({ error: null }),
        signInWithOtp: vi.fn(),
        refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      })),
      removeChannel: vi.fn(),
      removeAllChannels: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock Supabase module
vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabaseClient,
}));

// Mock notification preferences so background enrichment (transformUser) is
// instant and deterministic — the real service's variable-latency dynamic
// import otherwise widens the auth-event race window under parallel test load.
vi.mock('@/services/userPreferencesService', () => ({
  userPreferencesService: {
    getNotificationPreferences: vi.fn().mockResolvedValue({
      push_enabled: false,
      email_enabled: true,
      chat_messages: true,
      broadcasts: true,
      calendar_reminders: true,
    }),
    updateNotificationPreferences: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock demo mode store
vi.mock('@/store/demoModeStore', () => {
  const mockStore = vi.fn(selector => {
    const state = { demoView: 'off', isDemoMode: false, setDemoView: vi.fn() };
    return selector ? selector(state) : state;
  }) as any;
  mockStore.getState = () => ({ demoView: 'off', isDemoMode: false, setDemoView: vi.fn() });
  return {
    useDemoModeStore: mockStore,
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsInstalledApp.mockReturnValue(false);
    mockIsChravelNativeIOS.mockReturnValue(false);
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
    // Reset auth mocks to default state
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSupabaseClient.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('should initialize with loading state', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Initially loading should be true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.authState).toBe('loading');
  });

  it('cold start settles to unauthenticated when no session is present', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.authState).toBe('unauthenticated');
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('exposes isHydrated=false while loading and true once the bootstrap settles', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Hydration gate: downstream auth-gated fetches wait on this to avoid
    // Trip-Not-Found flashes during the session-hydration race.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isHydrated).toBe(false);

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('refreshes expired tokens during bootstrap', async () => {
    const expiredSession = {
      ...mockSession,
      access_token: 'bad.token.payload',
    };
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: expiredSession },
      error: null,
    });
    mockSupabaseClient.auth.refreshSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockSupabaseClient.auth.refreshSession).toHaveBeenCalled();
    expect(result.current.authState).toBe('authenticated');
  });

  it('does not sign out on transient refresh failures during bootstrap', async () => {
    const expiredSession = {
      ...mockSession,
      access_token: 'bad.token.payload',
    };
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: expiredSession },
      error: null,
    });
    mockSupabaseClient.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError' },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockSupabaseClient.auth.refreshSession).toHaveBeenCalled();
    expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled();
    expect(result.current.user?.id).toBe(mockUser.id);
    expect(result.current.authState).toBe('authenticated');
  });
  it('handles logout race by ending in signed-out state', async () => {
    let authListener: ((event: string, session: any) => void) | undefined;
    (mockSupabaseClient.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authListener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    // Wait until background enrichment (transformUser) has committed — the
    // session-derived user has notificationSettings.messages === null, the
    // enriched user has a boolean. This drains the init bootstrap's setState so
    // it cannot race the logout sequence below.
    await waitFor(() => expect(result.current.user?.notificationSettings.messages).not.toBeNull());

    act(() => {
      authListener?.('TOKEN_REFRESHED', mockSession);
      authListener?.('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.authState).toBe('unauthenticated'));
  });

  it('propagates multi-tab sign-out via auth subscription', async () => {
    let authListener: ((event: string, session: any) => void) | undefined;
    (mockSupabaseClient.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authListener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    // Wait until background enrichment has committed (boolean notification
    // settings) so no in-flight init setState can race the sign-out below.
    await waitFor(() => expect(result.current.user?.notificationSettings.messages).not.toBeNull());

    act(() => authListener?.('SIGNED_OUT', null));

    await waitFor(() => expect(result.current.authState).toBe('unauthenticated'));
  });

  it('syncs auth metadata when updating display and real names', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toBeTruthy();
    });

    await act(async () => {
      await result.current.updateProfile({
        display_name: 'Crew Chief',
        real_name: 'Christian Amechi',
      });
    });

    expect(mockSupabaseClient.auth.updateUser).toHaveBeenCalledWith({
      data: {
        display_name: 'Crew Chief',
        full_name: 'Christian Amechi',
      },
    });
  });

  it('should handle sign up flow', async () => {
    mockSupabaseClient.auth.signUp.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 },
    );

    const signUpResult = await result.current.signUp(
      'test@example.com',
      'password123',
      'Test',
      'User',
    );

    expect(signUpResult.error).toBeUndefined();
    expect(mockSupabaseClient.auth.signUp).toHaveBeenCalled();
  });

  it('uses default OAuth redirect in browser (no skipBrowserRedirect)', async () => {
    mockIsInstalledApp.mockReturnValue(false);
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://oauth.example/authorize' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    const call = mockSupabaseClient.auth.signInWithOAuth.mock.calls[0][0];
    expect(call).toMatchObject({
      provider: 'google',
      options: expect.objectContaining({
        skipBrowserRedirect: false,
      }),
    });
    expect(call.options.redirectTo).toMatch(/\/auth(\?|$)/);
    expect(call.options.redirectTo).not.toContain('chravel.app/auth-callback');
    expect(mockOpenInstalledAuthBrowser).not.toHaveBeenCalled();
  });

  it('routes installed-app OAuth to Universal Link and launches external auth browser', async () => {
    mockIsInstalledApp.mockReturnValue(true);
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://oauth.example/authorize' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    const call = mockSupabaseClient.auth.signInWithOAuth.mock.calls[0][0];
    expect(call).toMatchObject({
      provider: 'google',
      options: expect.objectContaining({
        skipBrowserRedirect: true,
        redirectTo: expect.stringContaining('https://chravel.app/auth-callback'),
      }),
    });
    expect(mockOpenInstalledAuthBrowser).toHaveBeenCalledWith('https://oauth.example/authorize');
  });

  it('uses explicit returnTo override for OAuth redirects', async () => {
    mockIsInstalledApp.mockReturnValue(false);
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://oauth.example/authorize' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    await act(async () => {
      await result.current.signInWithGoogle('/join/chravelhmbehnbu');
    });

    const call = mockSupabaseClient.auth.signInWithOAuth.mock.calls[0][0];
    expect(call.options.redirectTo).toContain(encodeURIComponent('/join/chravelhmbehnbu'));
  });

  it('routes installed-app Apple OAuth to Universal Link and launches external auth browser', async () => {
    mockIsInstalledApp.mockReturnValue(true);
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://appleid.apple.com/auth/authorize' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    await act(async () => {
      await result.current.signInWithApple();
    });

    const call = mockSupabaseClient.auth.signInWithOAuth.mock.calls[0][0];
    expect(call).toMatchObject({
      provider: 'apple',
      options: expect.objectContaining({
        skipBrowserRedirect: true,
        redirectTo: expect.stringContaining('https://chravel.app/auth-callback'),
      }),
    });
    expect(mockOpenInstalledAuthBrowser).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/authorize',
    );
  });

  it('iOS-native Apple uses the native sheet exclusively (signInWithIdToken, no browser OAuth)', async () => {
    mockIsChravelNativeIOS.mockReturnValue(true);
    mockIsInstalledApp.mockReturnValue(true);
    const nativeSignIn = vi.fn().mockResolvedValue({
      identityToken: 'id-token',
      rawNonce: 'raw-nonce',
      authorizationCode: 'auth-code',
    });
    (window as unknown as { ChravelNative: Record<string, unknown> }).ChravelNative = {
      platform: 'ios',
      isNative: true,
      signInWithApple: nativeSignIn,
    };
    mockSupabaseClient.auth.signInWithIdToken.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    let outcome: { error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.signInWithApple();
    });

    expect(outcome).toEqual({});
    expect(nativeSignIn).toHaveBeenCalledTimes(1);
    expect(mockSupabaseClient.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'id-token',
      nonce: 'raw-nonce',
    });
    // CRITICAL (App Store 2.1a): no browser OAuth round-trip on iOS native.
    expect(mockSupabaseClient.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenInstalledAuthBrowser).not.toHaveBeenCalled();
    // The one-time authorization code is forwarded fire-and-forget to store-apple-token
    // (deferred via setTimeout) so account deletion can revoke the Apple grant (5.1.1(v)).
    await waitFor(() =>
      expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('store-apple-token', {
        body: { authorizationCode: 'auth-code' },
      }),
    );
  });

  it('iOS-native Apple shows a retriable error and never falls through to PKCE when the native sheet throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockIsChravelNativeIOS.mockReturnValue(true);
    mockIsInstalledApp.mockReturnValue(true);
    (window as unknown as { ChravelNative: Record<string, unknown> }).ChravelNative = {
      platform: 'ios',
      isNative: true,
      signInWithApple: vi.fn().mockRejectedValue(new Error('The user canceled the request.')),
    };

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    let outcome: { error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.signInWithApple();
    });

    expect(outcome?.error).toMatch(/didn't complete/i);
    // No browser fallback — the user is never sent to the "exchange external code" page.
    expect(mockSupabaseClient.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockSupabaseClient.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(mockOpenInstalledAuthBrowser).not.toHaveBeenCalled();
    // Restore console here: beforeEach uses clearAllMocks (not restoreAllMocks), so a
    // spyOn implementation would otherwise leak into later tests.
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('iOS-native Apple asks the user to update when the native bridge is missing (no PKCE fallback)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockIsChravelNativeIOS.mockReturnValue(true);
    mockIsInstalledApp.mockReturnValue(true);
    // platform === 'ios' but the older shell did not inject signInWithApple.
    (window as unknown as { ChravelNative: Record<string, unknown> }).ChravelNative = {
      platform: 'ios',
      isNative: true,
    };

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    let outcome: { error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.signInWithApple();
    });

    expect(outcome?.error).toMatch(/update from the App Store/i);
    expect(mockSupabaseClient.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenInstalledAuthBrowser).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('returns null from fetchUserProfile on non-PGRST116 errors without retrying with a narrower select', async () => {
    // Establish a session so transformUser invokes fetchUserProfile.
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const profileSelectCalls: string[] = [];
    (mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table !== 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: vi.fn((resolve: (value: { data: never[]; error: null }) => void) =>
            resolve({ data: [], error: null }),
          ),
        };
      }
      // Track every select() argument against the profiles table and force
      // a non-PGRST116 error on .single() so the error branch is exercised.
      const chain = {
        select: vi.fn((cols: string) => {
          profileSelectCalls.push(cols);
          return chain;
        }),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST200', message: 'column "job_title" does not exist' },
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof vi.fn>;
      return chain;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Auth should still resolve (session-derived user), but the profile
    // payload is null — no half-populated fallback row.
    expect(result.current.user).toBeTruthy();
    expect(result.current.user?.jobTitle).toBeUndefined();

    // The legacy fallback issued a SECOND select with a narrower column
    // list. The current code must not — exactly one profile select per
    // fetchUserProfile call, always with the full column set including
    // subscription/role fields.
    const minimalFallback = profileSelectCalls.find(
      cols =>
        cols.includes('show_phone') &&
        !cols.includes('app_role') &&
        !cols.includes('subscription_status'),
    );
    expect(minimalFallback).toBeUndefined();
    // Every profile select that we did issue must include role and
    // subscription columns — those were the columns the old fallback
    // silently dropped, which is the regression we're guarding against.
    for (const cols of profileSelectCalls) {
      if (cols.includes('show_phone')) {
        expect(cols).toContain('app_role');
        expect(cols).toContain('subscription_status');
      }
    }
  });
});
