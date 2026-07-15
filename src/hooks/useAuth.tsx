/* eslint-disable react-refresh/only-export-components -- useAuth hook is co-located with AuthProvider by design */
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { invalidateAuthCache } from '@/lib/authCache';
import { queryClient } from '@/lib/queryClient';
import { removePersistedQueryCache } from '@/lib/queryPersister';
import { SUPER_ADMIN_EMAILS } from '@/constants/admins';
import { useDemoModeStore } from '@/store/demoModeStore';
import { conciergeCacheService } from '@/services/conciergeCacheService';
import { isSessionTokenValid } from '@/utils/tokenValidation';
import {
  isInstalledApp,
  isCapacitorNativeShell,
  isChravelNativeShell,
  isChravelNativeIOS,
} from '@/utils/platformDetection';
import { authDebug } from '@/utils/authDebug';
import { telemetry } from '@/telemetry/service';
import { toast } from '@/hooks/use-toast';
import { logAuthEvent } from '@/utils/authTelemetry';
import { buildSessionDerivedUser } from '@/lib/sessionDerivedUser';
import { generateSafeUuid } from '@/utils/uuid';
import { openInstalledAuthBrowser } from '@/utils/installedAuthBrowser';
import { attemptNativeAppleSignIn, isLikelyUserCancellation } from '@/utils/nativeAppleSignIn';
import { errorTracking } from '@/services/errorTracking';
import { performanceService } from '@/services/performanceService';
import type { AuthUser as User, UserProfile, AuthContextType } from './auth/types';
import {
  createDemoUser,
  getOAuthRedirectUrl,
  getOAuthReturnTo,
  withTimeout,
} from './auth/authHelpers';
import { captureAppleRefreshToken, captureAppleAuthorizationCode } from './auth/captureAppleToken';
import { isFatalAuthRefreshError } from './auth/sessionRefreshPolicy';

const TRIPS_QUERY_KEY = 'trips';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function identifyRevenueCatUserWhenNative(userId: string): void {
  if (!isCapacitorNativeShell() && !isChravelNativeShell()) return;

  void import('@/integrations/revenuecat/revenuecatClient')
    .then(({ identifyUser }) => identifyUser(userId))
    .catch(err => {
      if (import.meta.env.DEV) {
        console.warn('[Auth] RevenueCat identify failed:', err);
      }
    });
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const demoView = useDemoModeStore(state => state.demoView);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [authErrorReason, setAuthErrorReason] = useState<string | null>(null);
  const authState: AuthContextType['authState'] = isLoading
    ? 'loading'
    : authErrorReason
      ? 'error'
      : user
        ? 'authenticated'
        : 'unauthenticated';
  const setAuthTransition = useCallback(
    (next: {
      loading?: boolean;
      user?: User | null;
      session?: Session | null;
      errorReason?: string | null;
    }) => {
      if (next.session !== undefined) setSession(next.session);
      if (next.user !== undefined) setUser(next.user);
      if (next.loading !== undefined) setIsLoading(next.loading);
      if (next.errorReason !== undefined) setAuthErrorReason(next.errorReason);
    },
    [],
  );
  const isLoadingRef = useRef(true);
  const authEventCounterRef = useRef(0);
  const activeSessionUserIdRef = useRef<string | null>(null);

  /**
   * App-preview mode should behave like "full demo access" even when there is no real auth session.
   * Many settings panels (and other UI) assume `useAuth().user` exists; returning null in app-preview
   * can cause runtime crashes/blank screens.
   *
   * We provide a stable, UUID-shaped demo user so code paths expecting UUIDs don't throw.
   */
  // Generate a stable but non-predictable demo UUID per session
  const demoUserId = useMemo(() => generateSafeUuid(), []);

  const demoUser: User = useMemo(() => createDemoUser(demoUserId), [demoUserId]);

  const shouldUseDemoUser = demoView === 'app-preview';
  const shouldUseDemoUserRef = useRef<boolean>(shouldUseDemoUser);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  useEffect(() => {
    activeSessionUserIdRef.current = session?.user?.id ?? null;
  }, [session]);

  useEffect(() => {
    shouldUseDemoUserRef.current = shouldUseDemoUser;
  }, [shouldUseDemoUser]);

  /**
   * Canonical identity model:
   * - `public.profiles` row keyed by `user_id` is the source of truth for display name + avatar.
   * - We defensively "self-heal" by creating the profile row if the DB trigger didn't run.
   */
  const ensureProfileExists = useCallback(async (supabaseUser: SupabaseUser): Promise<void> => {
    try {
      const displayName =
        (supabaseUser.user_metadata?.display_name as string | undefined) ||
        (supabaseUser.user_metadata?.full_name as string | undefined) ||
        (supabaseUser.user_metadata?.name as string | undefined) ||
        supabaseUser.email?.split('@')[0] ||
        'User';

      // Email/phone live in private_profiles; profiles only has display_name, etc.
      await supabase
        .from('profiles')
        .upsert(
          { user_id: supabaseUser.id, display_name: displayName },
          { onConflict: 'user_id', ignoreDuplicates: true },
        );
    } catch (error) {
      // Never block auth on profile creation failures.
      if (import.meta.env.DEV) {
        console.warn('[Auth] Failed to ensure profile exists:', error);
      }
    }
  }, []);

  // Fetch the authenticated user's profile row. Columns must match
  // public.profiles in supabase/types.ts — drift is caught by
  // scripts/check-schema-drift.ts in CI. PGRST116 means "no row", which we
  // surface as null. Any other error is reported to Sentry and we return
  // null rather than serving a half-populated profile (the old fallback
  // dropped app_role and subscription_* columns, which is a worse failure
  // mode than failing closed).
  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, user_id, display_name, real_name, name_preference, first_name, last_name, avatar_url, bio, phone, show_email, show_phone, job_title, show_job_title, ' +
          'notification_settings, timezone, app_role, role, subscription_status, subscription_product_id, ' +
          'subscription_end, free_pro_trips_used, free_pro_trip_limit, free_events_used, free_event_limit, ' +
          'created_at, updated_at',
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      if (import.meta.env.DEV) {
        console.error('[Auth] Profile fetch failed:', error.message);
      }
      errorTracking.captureException(error, {
        userId,
        context: 'auth.fetchUserProfile',
        additionalData: { code: error.code },
      });
      return null;
    }

    return (data as unknown as UserProfile) ?? null;
  };

  // Helper function to transform Supabase user to app User
  const transformUser = useCallback(
    async (supabaseUser: SupabaseUser, profile?: UserProfile | null): Promise<User | null> => {
      // CRITICAL: Validate that we have a valid user ID before proceeding
      if (!supabaseUser || !supabaseUser.id) {
        if (import.meta.env.DEV) {
          console.error('[transformUser] Invalid Supabase user - missing ID', { supabaseUser });
        }
        return null;
      }

      // NOTE: Demo mode check REMOVED here - authenticated users should ALWAYS get their real data
      // Demo mode is for unauthenticated users browsing the app-preview, not for overriding real user data

      // ⚡ PERFORMANCE: Parallelize all database queries (was 2-3s sequential, now <1s parallel)
      const [userProfile, userRolesResult, orgMemberResult, notifPrefs] = await Promise.all([
        // Fetch profile with 2s timeout (reduced from 3s)
        profile || withTimeout(fetchUserProfile(supabaseUser.id), 2000, null),

        // Query user_roles table with 2s timeout
        withTimeout(
          (async () => {
            const { data, error } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', supabaseUser.id);
            return { data, error };
          })(),
          2000,
          { data: [], error: null },
        ),

        // Query org membership with 2s timeout
        withTimeout(
          (async () => {
            const { data, error } = await supabase
              .from('organization_members')
              .select('organization_id, role')
              .eq('user_id', supabaseUser.id)
              .eq('status', 'active')
              .single();
            return { data, error };
          })(),
          2000,
          { data: null, error: null },
        ),

        // Load notification prefs with 2s timeout
        (async () => {
          try {
            const { userPreferencesService } = await import('@/services/userPreferencesService');
            return await withTimeout(
              userPreferencesService.getNotificationPreferences(supabaseUser.id),
              2000,
              {
                push_enabled: false,
                email_enabled: true,
                chat_messages: true,
                mentions_only: false,
                broadcasts: true,
                tasks: false,
                payments: false,
                calendar_events: true,
                calendar_reminders: true,
                polls: true,
                trip_invites: true,
                join_requests: false,
                basecamp_updates: true,
                messages: true,
                broadcasts_and_pins: true,
                quiet_hours_enabled: false,
                quiet_start: '22:00',
                quiet_end: '08:00',
                timezone: 'America/New_York',
              } as any,
            );
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn(
                '[transformUser] Failed to load notification prefs, using defaults:',
                err,
              );
            }
            return {
              push_enabled: false,
              email_enabled: true,
              chat_messages: true,
              mentions_only: false,
              broadcasts: true,
              tasks: false,
              payments: false,
              calendar_reminders: true,
              trip_invites: true,
              join_requests: false,
              quiet_hours_enabled: false,
              quiet_start: '22:00',
              quiet_end: '08:00',
              timezone: 'America/New_York',
            };
          }
        })(),
      ]);

      // Self-heal missing profiles row (trigger can fail in some Supabase projects/environments).
      if (!userProfile) {
        await ensureProfileExists(supabaseUser);
      }

      const roles = userRolesResult.data?.map((r: { role: string }) => r.role) || [];
      const isPro = roles.includes('pro');
      const isSystemAdmin = roles.includes('enterprise_admin');
      const isSuperAdminEmail = SUPER_ADMIN_EMAILS.includes(
        supabaseUser.email?.toLowerCase().trim() || '',
      );

      // Map roles to permissions - only grant what user actually has
      const permissions: string[] = ['read'];
      if (isPro || isSystemAdmin || isSuperAdminEmail) {
        permissions.push('write');
      }
      if (isSystemAdmin || isSuperAdminEmail) {
        permissions.push('admin', 'finance', 'compliance');
      }

      // Map org member role to proRole type (owner/admin maps to admin, otherwise undefined)
      let proRole: User['proRole'] = undefined;
      if (
        orgMemberResult.data?.role === 'owner' ||
        orgMemberResult.data?.role === 'admin' ||
        isSuperAdminEmail
      ) {
        proRole = 'admin';
      }

      // Check if profile has been properly set up (display_name exists and is not empty)
      const hasCompletedProfileSetup = !!(
        userProfile?.display_name && userProfile.display_name.trim() !== ''
      );

      return {
        id: supabaseUser.id,
        email: supabaseUser.email,
        phone: userProfile?.phone ?? supabaseUser.phone,
        displayName: userProfile?.display_name || supabaseUser.email || 'User',
        realName: userProfile?.real_name ?? undefined,
        namePreference: (userProfile?.name_preference === 'real' ? 'real' : 'display') as
          | 'real'
          | 'display',
        hasCompletedProfileSetup,
        firstName: userProfile?.first_name || '',
        lastName: userProfile?.last_name || '',
        avatar: userProfile?.avatar_url || '',
        bio: userProfile?.bio || '',
        isPro,
        showEmail: userProfile?.show_email || false,
        showPhone: userProfile?.show_phone || false,
        jobTitle: userProfile?.job_title ?? undefined,
        showJobTitle: userProfile?.show_job_title ?? false,
        proRole,
        organizationId: orgMemberResult.data?.organization_id || undefined,
        permissions,
        notificationSettings: {
          messages: notifPrefs.chat_messages,
          broadcasts: notifPrefs.broadcasts,
          tripUpdates: notifPrefs.calendar_reminders,
          email: notifPrefs.email_enabled,
          push: notifPrefs.push_enabled,
        },
      };
    },
    [ensureProfileExists],
  );

  /** Warm React Query cache for dashboard trips in parallel with profile enrichment. */
  const prefetchUserTrips = useCallback((userId: string) => {
    void queryClient.prefetchQuery({
      queryKey: [TRIPS_QUERY_KEY, userId, false],
      queryFn: async () => {
        const { tripService } = await import('@/services/tripService');
        return tripService.getUserTrips(false, undefined, userId);
      },
      staleTime: 1000 * 60 * 5,
    });
  }, []);

  /**
   * Force refresh session when token is invalid.
   * Returns refreshed session or null if refresh fails.
   */
  const forceRefreshSession = useCallback(async (): Promise<Session | null> => {
    authDebug('forceRefreshSession:start');

    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        authDebug('forceRefreshSession:error', {
          message: error.message,
          name: error.name,
          status: (error as unknown as { status?: number }).status,
          fatal: isFatalAuthRefreshError(error),
        });
        // Only destroy persisted sessions on definitive auth failures. Network blips
        // must not sign users out — autoRefreshToken will retry when connectivity returns.
        if (isFatalAuthRefreshError(error)) {
          await supabase.auth.signOut();
        }
        return null;
      }

      // Validate the refreshed token
      if (data.session && !isSessionTokenValid(data.session.access_token)) {
        authDebug('forceRefreshSession:refreshedTokenInvalid');
        await supabase.auth.signOut();
        return null;
      }

      authDebug('forceRefreshSession:success', {
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.session?.user),
        hasExpiresAt: Boolean(data.session?.expires_at),
      });

      return data.session;
    } catch (err) {
      authDebug('forceRefreshSession:exception', { error: String(err) });
      // Transient exceptions (offline, timeout) must not clear the stored refresh token.
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    // Safety timeout: force loading to false after 10 seconds to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isLoadingRef.current) {
        setIsLoading(false);
      }
    }, 10000);

    const getSessionAndUser = async () => {
      try {
        authDebug('init:getSession:start', {
          visibilityState: document.visibilityState,
          storageAvailable: (() => {
            try {
              return typeof localStorage !== 'undefined';
            } catch {
              return false;
            }
          })(),
          hasAuthSessionKey: (() => {
            try {
              return Boolean(localStorage.getItem('chravel-auth-session'));
            } catch {
              return false;
            }
          })(),
        });
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          authDebug('init:getSession:error', {
            message: error.message,
            name: error.name,
            status: (error as unknown as { status?: number }).status,
          });
          if (import.meta.env.DEV) {
            console.error('[Auth] Error getting session:', error);
          }
          // Retry once after 1s for transient network issues
          await new Promise(r => setTimeout(r, 1000));
          const retry = await supabase.auth.getSession();
          if (retry.data.session) {
            authDebug('init:getSession:retrySessionPresent', {
              hasExpiresAt: Boolean(retry.data.session.expires_at),
              hasRefreshToken: Boolean(retry.data.session.refresh_token),
            });
            // Validate token before using
            if (!isSessionTokenValid(retry.data.session.access_token)) {
              authDebug('init:getSession:retryTokenInvalid');
              const refreshed = await forceRefreshSession();
              if (refreshed) {
                setAuthTransition({
                  session: refreshed,
                  user: buildSessionDerivedUser(refreshed.user),
                  errorReason: null,
                });
                prefetchUserTrips(refreshed.user.id);
                identifyRevenueCatUserWhenNative(refreshed.user.id);
                void transformUser(refreshed.user).then(u => {
                  if (u && activeSessionUserIdRef.current === refreshed.user.id) setUser(u);
                });
              }
              setIsLoading(false);
              return;
            }
            setAuthTransition({
              session: retry.data.session,
              user: buildSessionDerivedUser(retry.data.session.user),
              errorReason: null,
            });
            prefetchUserTrips(retry.data.session.user.id);
            identifyRevenueCatUserWhenNative(retry.data.session.user.id);
            void transformUser(retry.data.session.user).then(u => {
              if (u && activeSessionUserIdRef.current === retry.data.session.user.id) setUser(u);
            });
            setIsLoading(false);
            return;
          }
          authDebug('init:getSession:retryNoSession');
          setIsLoading(false);
          return;
        }

        authDebug('init:getSession:result', {
          hasSession: Boolean(session),
          hasUser: Boolean(session?.user),
          hasExpiresAt: Boolean(session?.expires_at),
          hasRefreshToken: Boolean(session?.refresh_token),
        });

        // CRITICAL: Validate token has required claims before using
        if (session?.access_token && !isSessionTokenValid(session.access_token)) {
          authDebug('init:getSession:tokenInvalid');

          const refreshedSession = await forceRefreshSession();
          if (refreshedSession) {
            authDebug('init:getSession:tokenInvalid:recoveredByRefresh', {
              hasExpiresAt: Boolean(refreshedSession.expires_at),
            });
            setAuthTransition({
              session: refreshedSession,
              user: buildSessionDerivedUser(refreshedSession.user),
              errorReason: null,
            });
            prefetchUserTrips(refreshedSession.user.id);
            identifyRevenueCatUserWhenNative(refreshedSession.user.id);
            void transformUser(refreshedSession.user).then(u => {
              if (u && activeSessionUserIdRef.current === refreshedSession.user.id) setUser(u);
            });
          } else if (session?.user) {
            authDebug('init:getSession:tokenInvalid:refreshFailed:keepSession');
            // Transient refresh failure — keep the stored session so autoRefreshToken can retry.
            setAuthTransition({
              session,
              user: buildSessionDerivedUser(session.user),
              errorReason: null,
            });
            prefetchUserTrips(session.user.id);
            identifyRevenueCatUserWhenNative(session.user.id);
            void transformUser(session.user).then(u => {
              if (u && activeSessionUserIdRef.current === session.user.id) setUser(u);
            });
          } else {
            authDebug('init:getSession:tokenInvalid:refreshFailed');
            setAuthTransition({
              user: shouldUseDemoUserRef.current ? demoUser : null,
              errorReason: 'token_refresh_failed',
            });
          }
          setIsLoading(false);
          return;
        }

        // Check if session exists but is near expiry (within 5 min)
        if (session && session.expires_at) {
          const expiresAt = session.expires_at * 1000;
          const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

          if (expiresAt < fiveMinutesFromNow) {
            if (import.meta.env.DEV) {
              console.log('[Auth] Session near expiry, proactively refreshing...');
            }
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed.session && isSessionTokenValid(refreshed.session.access_token)) {
              setSession(refreshed.session);
              setUser(buildSessionDerivedUser(refreshed.session.user));
              prefetchUserTrips(refreshed.session.user.id);
              identifyRevenueCatUserWhenNative(refreshed.session.user.id);
              void transformUser(refreshed.session.user).then(u => {
                if (u) setUser(u);
              });
              setIsLoading(false);
              return;
            }
          }
        }

        setAuthTransition({ session, errorReason: null });

        if (session?.user) {
          authDebug('init:sessionPresent', {
            hasExpiresAt: Boolean(session.expires_at),
            hasRefreshToken: Boolean(session.refresh_token),
          });

          // 🔒 Clear stale demo mode when restoring an authenticated session.
          // Prevents demo trips from appearing on the dashboard after a page
          // reload when the user previously explored the app in demo mode.
          const demoStore = useDemoModeStore.getState();
          if (demoStore.isDemoMode || demoStore.demoView === 'app-preview') {
            demoStore.setDemoView('off');
          }

          // Log session info in dev for debugging
          if (import.meta.env.DEV) {
            console.log('[Auth] Session state:', {
              hasSession: true,
              expiresAt: session.expires_at
                ? new Date(session.expires_at * 1000).toISOString()
                : null,
              refreshToken: session.refresh_token ? '(present)' : '(missing)',
              userId: session.user.id?.slice(0, 8) + '...',
            });
          }
          try {
            setAuthTransition({ user: buildSessionDerivedUser(session.user), errorReason: null });
            prefetchUserTrips(session.user.id);
            identifyRevenueCatUserWhenNative(session.user.id);
            void transformUser(session.user).then(u => {
              if (u && activeSessionUserIdRef.current === session.user.id) setUser(u);
            });
          } catch (err) {
            authDebug('init:transformUser:error', { error: String(err) });
            if (import.meta.env.DEV) {
              console.error('[Auth] Error transforming user on init:', err);
            }
            setAuthTransition({ user: null, errorReason: 'session_transform_failed' });
          }
        } else {
          authDebug('init:noSession');
          // App-preview: provide a demo user even when not authenticated.
          setAuthTransition({
            user: shouldUseDemoUserRef.current ? demoUser : null,
            errorReason: null,
          });
        }
        setIsLoading(false);
      } catch (error) {
        authDebug('init:getSession:exception', { error: String(error) });
        if (import.meta.env.DEV) {
          console.error('[Auth] Unexpected error in getSessionAndUser:', error);
        }
        setIsLoading(false);
      } finally {
        setIsHydrated(true);
        performanceService.markBootPhase('auth_hydrated');
      }
    };

    getSessionAndUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const authEventId = ++authEventCounterRef.current;
      // CRITICAL: Only synchronous state updates in callback to prevent deadlock
      authDebug('onAuthStateChange', {
        event,
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user),
        hasExpiresAt: Boolean(session?.expires_at),
      });
      setAuthTransition({ session });

      if (session?.user) {
        // Invalidate auth cache on explicit sign in / session refresh
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          invalidateAuthCache();
        }

        // 🔒 Clear demo mode when a real user signs in — prevents stale demo
        // data from showing on the dashboard after invite-link sign-up/sign-in.
        if (event === 'SIGNED_IN') {
          const demoStore = useDemoModeStore.getState();
          if (demoStore.isDemoMode || demoStore.demoView === 'app-preview') {
            demoStore.setDemoView('off');
          }

          // 🍎 Capture the Apple Sign-in refresh token (present only on the initial
          // OAuth redirect) so the account-deletion flow can revoke the Apple grant
          // per App Store 5.1.1(v). Best-effort, non-blocking — no-ops for non-Apple.
          captureAppleRefreshToken(session);

          // 🔒 Detect potential duplicate provider account: if a brand-new Google OAuth
          // user's email already has a profile under a different user_id, warn the user
          // so they know to use their original sign-in method instead.
          const signedInUser = session.user;
          const provider = signedInUser.app_metadata?.provider;
          const createdAt = new Date(signedInUser.created_at).getTime();
          const isNewAccount = Date.now() - createdAt < 60_000;

          if (provider === 'google' && isNewAccount && signedInUser.email) {
            setTimeout(async () => {
              try {
                const { data: existingProfiles } = await supabase
                  .from('profiles')
                  .select('user_id')
                  .eq('email', signedInUser.email!)
                  .neq('user_id', signedInUser.id)
                  .limit(1);

                if (existingProfiles && existingProfiles.length > 0) {
                  toast({
                    title: 'Possible Duplicate Account',
                    description:
                      'An account with this email already exists. To avoid split data, sign out and use your original sign-in method (email/password).',
                    variant: 'destructive',
                  });
                }
              } catch {
                // Non-critical — silently ignore detection failures
              }
            }, 500);
          }
        }

        // Defer async work with setTimeout(0) to avoid Supabase auth deadlock
        setTimeout(() => {
          if (authEventId !== authEventCounterRef.current) return;
          setUser(buildSessionDerivedUser(session.user));
          prefetchUserTrips(session.user.id);
          identifyRevenueCatUserWhenNative(session.user.id);
          setIsLoading(false);

          transformUser(session.user)
            .then(transformedUser => {
              if (authEventId !== authEventCounterRef.current) return;
              authDebug('onAuthStateChange:transformUser:success');
              if (transformedUser) {
                setUser(transformedUser);
                // Identify user in analytics (no email for privacy)
                telemetry.identify({
                  id: transformedUser.id,
                  display_name: transformedUser.displayName ?? undefined,
                  is_pro: transformedUser.isPro ?? undefined,
                  organization_id: transformedUser.organizationId ?? undefined,
                });
              }
            })
            .catch(err => {
              authDebug('onAuthStateChange:transformUser:error', { error: String(err) });
              if (import.meta.env.DEV) {
                console.error('[Auth] Error transforming user:', err);
              }
              setUser(buildSessionDerivedUser(session.user));
            });
        }, 0);
      } else {
        authDebug('onAuthStateChange:signedOutOrNoSession', { event });
        invalidateAuthCache();
        // Only wipe client caches on explicit sign-out. Spurious null-session events
        // during refresh/resume must not nuke in-memory trip data or flash auth UI.
        if (event === 'SIGNED_OUT') {
          queryClient.clear();
          void removePersistedQueryCache();
          void supabase.removeAllChannels();
          conciergeCacheService.clearAllCaches();
          void clearNotificationRealtimeStore();
          telemetry.reset();
        }
        // App-preview: keep demo user when logged out.
        setAuthTransition({
          user: shouldUseDemoUserRef.current ? demoUser : null,
          errorReason: event === 'SIGNED_OUT' ? null : 'session_missing',
        });
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- forceRefreshSession is stable (useCallback with no deps), adding it risks auth re-init loops
  }, [transformUser, demoUser, prefetchUserTrips]);

  // Visibility change listener: refresh session when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !session) return;

      void (async () => {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!currentSession) {
          if (import.meta.env.DEV) {
            console.log('[Auth] Session missing on resume, attempting refresh...');
          }
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            authDebug('visibility:refreshSession:error', {
              message: error.message,
              fatal: isFatalAuthRefreshError(error),
            });
            // Do not clear in-memory auth on transient failures — that flashes the sign-in modal
            // while the refresh token may still be valid in storage.
            if (isFatalAuthRefreshError(error)) {
              setAuthTransition({
                session: null,
                user: shouldUseDemoUserRef.current ? demoUser : null,
                errorReason: 'visibility_refresh_failed',
              });
            }
          }
          return;
        }

        if (currentSession.expires_at) {
          const expiresAt = currentSession.expires_at * 1000;
          const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
          if (expiresAt < fiveMinutesFromNow) {
            if (import.meta.env.DEV) {
              console.log('[Auth] Session near expiry on tab focus, refreshing...');
            }
            void supabase.auth.refreshSession();
          }
        }
      })();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session, demoUser, setAuthTransition]);

  // Respond to demo mode toggles while logged out (no session).
  useEffect(() => {
    if (session?.user) return;
    setUser(shouldUseDemoUser ? demoUser : null);
  }, [demoUser, session, shouldUseDemoUser]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Sign in error:', error);
          }
          logAuthEvent('login_failure', { method: 'email', errorReason: error.message });
          setIsLoading(false);

          // Provide more specific error messages
          if (error.message.includes('Invalid login credentials')) {
            return {
              error: 'Invalid email or password. Please check your credentials and try again.',
            };
          }
          if (error.message.includes('Email not confirmed')) {
            return {
              error:
                'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
            };
          }

          return { error: error.message };
        }

        // Success path: clear loading state (auth state listener will update user)
        logAuthEvent('login_success', { method: 'email' });
        setIsLoading(false);
        void data;
        return {};
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Unexpected sign in error:', error);
        }
        setIsLoading(false);
        return { error: 'An unexpected error occurred. Please try again.' };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (returnToOverride?: string): Promise<{ error?: string }> => {
      try {
        const installed = isInstalledApp();
        // Installed shells (Capacitor / PWA) return to a callback the native wrapper
        // hands back into the WebView so Supabase detectSessionInUrl can complete the
        // exchange; the chravel-mobile shell uses the chravel:// custom scheme. Web
        // stays on same-origin. See getOAuthRedirectUrl.
        const returnTo = getOAuthReturnTo(returnToOverride);
        const redirectUrl = getOAuthRedirectUrl(returnTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            // In Capacitor / PWA / webview, default redirect opens the system browser and strands the shell.
            skipBrowserRedirect: installed,
            // Force account picker so users don't accidentally sign in with the wrong Google account,
            // which could create a duplicate profile if the email differs from their email/password account.
            // NOTE: Enable "Automatic Linking" in Supabase Dashboard (Auth > Providers) to prevent
            // duplicate auth.users entries when the same email is used across providers.
            queryParams: { prompt: 'select_account' },
          },
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Google OAuth error:', error);
          }
          if (error.message.includes('provider is not enabled')) {
            return { error: 'Google sign-in is not configured. Please contact support.' };
          }
          return { error: error.message };
        }

        if (installed && data?.url) {
          // Prefers @capacitor/browser (SFSafariViewController / Chrome Custom Tabs)
          // when the native shell registers it; falls back to same-tab navigation.
          // Google rejects embedded WebView OAuth with disallowed_useragent — the
          // native shell must open this URL outside the embedded WebView.
          const result = await openInstalledAuthBrowser(data.url);
          if (result.strategy === 'native-shell-missing-bridge') {
            return {
              error:
                'Your ChravelApp app needs an update to sign in with Google. Please update from the App Store and try again.',
            };
          }
        }

        return {};
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Unexpected Google OAuth error:', error);
        }
        return { error: 'An unexpected error occurred. Please try again.' };
      }
    },
    [],
  );

  const signInWithApple = useCallback(
    async (returnToOverride?: string): Promise<{ error?: string }> => {
      // On the iOS shell we MUST authenticate exclusively through the native Sign in with
      // Apple sheet. The SFSafariViewController / PKCE fallback is the "Unable to exchange
      // external code" dead end App Review rejected (Guideline 2.1(a)) — never reach it here.
      const iosNative = isChravelNativeIOS();
      try {
        // Prefer native Sign in with Apple (id-token) when the chravel-mobile shell exposes
        // it — this authenticates without the SFSafariViewController / Universal-Link
        // round-trip that App Review flagged as not proceeding on iPad (Guideline 2.1(a)).
        const native = await attemptNativeAppleSignIn(supabase.auth);
        if (native.handled) {
          if (native.error) {
            if (import.meta.env.DEV) {
              console.error('[Auth] Native Apple sign-in error:', native.error);
            }
            logAuthEvent('login_failure', { method: 'apple', errorReason: native.error });
            if (native.error.includes('provider is not enabled')) {
              return { error: 'Apple sign-in is not configured. Please contact support.' };
            }
            return { error: native.error };
          }
          // signInWithIdToken yields no provider_refresh_token, so the SIGNED_IN listener's
          // captureAppleRefreshToken no-ops here. Forward the one-time authorization code so
          // account deletion can still revoke the Apple grant (App Store 5.1.1(v)).
          if (native.authorizationCode) {
            captureAppleAuthorizationCode(native.authorizationCode);
          }
          return {};
        }

        // The native bridge did not produce a session.
        if (iosNative) {
          // App Store 2.1(a): on iOS the native sheet is the ONLY path. Never fall through to
          // browser OAuth/PKCE — that strands the user on the "exchange external code" page.
          // Surface a retriable inline error (AuthModal stays put, no /auth navigation) and
          // log the underlying cause so "c892"-type failures map to a reason.
          const reason = native.unhandledReason ?? 'unknown';
          if (import.meta.env.DEV) {
            console.error(
              '[Auth] iOS native Apple sign-in did not complete:',
              reason,
              native.cause,
            );
          }
          logAuthEvent('login_failure', { method: 'apple', errorReason: `native_${reason}` });
          // User cancellations are expected UX, not faults — keep them out of Sentry.
          const cancellation = reason === 'bridge-threw' && isLikelyUserCancellation(native.cause);
          if (!cancellation) {
            errorTracking.captureException(
              native.cause instanceof Error ? native.cause : new Error(`apple_native_${reason}`),
              { context: 'auth.signInWithApple.native', additionalData: { reason } },
            );
          }
          if (reason === 'bridge-missing') {
            return {
              error:
                'Your ChravelApp app needs an update to sign in with Apple. Please update from the App Store, or sign in with email.',
            };
          }
          return {
            error: "Sign in with Apple didn't complete. Please try again, or sign in with email.",
          };
        }

        // Non-iOS surfaces (web / Android / PWA): the existing web OAuth fallback is safe.
        const installed = isInstalledApp();
        const returnTo = getOAuthReturnTo(returnToOverride);
        const redirectUrl = getOAuthRedirectUrl(returnTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: installed,
          },
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Apple OAuth error:', error);
          }
          if (error.message.includes('provider is not enabled')) {
            return { error: 'Apple sign-in is not configured. Please contact support.' };
          }
          return { error: error.message };
        }

        if (installed && data?.url) {
          const result = await openInstalledAuthBrowser(data.url);
          if (result.strategy === 'native-shell-missing-bridge') {
            return {
              error:
                'Your ChravelApp app needs an update to sign in with Apple. Please update from the App Store and try again.',
            };
          }
          // Belt-and-suspenders: if we're in a native shell but ended up on the
          // unsafe `web-redirect` path (no Capacitor Browser, no ChravelNative
          // bridge), refuse to strand the user inside the WebView's provider
          // chain — surface an actionable error instead (App Store 2.1a).
          if (
            result.strategy === 'web-redirect' &&
            (isCapacitorNativeShell() || isChravelNativeShell())
          ) {
            return {
              error:
                'Your ChravelApp app needs an update to sign in with Apple. Please update from the App Store, or sign in with email.',
            };
          }
        }

        return {};
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Unexpected Apple OAuth error:', error);
        }
        return { error: 'An unexpected error occurred. Please try again.' };
      }
    },
    [],
  );

  const signInWithPhone = useCallback(async (phone: string): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Phone OTP error:', error);
        }
        logAuthEvent('phone_otp_failure', { method: 'phone', errorReason: error.message });
        setIsLoading(false);

        // Provide more specific error messages
        if (error.message.includes('not configured') || error.message.includes('SMS provider')) {
          return { error: 'Phone authentication is not configured. Please use email to sign in.' };
        }
        if (error.message.includes('Invalid phone number')) {
          return {
            error: 'Please enter a valid phone number with country code (e.g., +1234567890).',
          };
        }

        return { error: error.message };
      }

      logAuthEvent('phone_otp_requested', { method: 'phone' });
      setIsLoading(false);
      return {};
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Auth] Unexpected phone OTP error:', error);
      }
      setIsLoading(false);
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      returnToOverride?: string,
    ): Promise<{ error?: string; success?: string }> => {
      try {
        setIsLoading(true);

        // Preserve returnTo so email confirmation lands back in the right place.
        // Callers on routes without a ?returnTo= query (e.g. /join/:token) pass it
        // explicitly so the invite survives confirmation in a different browser.
        const signUpReturnTo =
          returnToOverride ?? new URLSearchParams(window.location.search).get('returnTo');
        const emailRedirectUrl = signUpReturnTo
          ? `${window.location.origin}/auth?returnTo=${encodeURIComponent(signUpReturnTo)}`
          : `${window.location.origin}/`;

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: emailRedirectUrl,
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`.trim(),
            },
          },
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Sign up error:', error);
          }
          logAuthEvent('signup_failure', { method: 'email', errorReason: error.message });
          setIsLoading(false);

          // Provide more specific error messages
          if (error.message.includes('already registered')) {
            return {
              error:
                'Unable to create account with this email. If you already have an account, try signing in or resetting your password.',
            };
          }
          if (error.message.includes('password')) {
            return { error: 'Password must be at least 6 characters long.' };
          }

          return { error: error.message };
        }

        logAuthEvent('signup_success', { method: 'email' });

        // Check if email confirmation is required
        if (data.user && !data.session) {
          setIsLoading(false);
          return { success: 'Account created! Please check your email to confirm your account.' };
        }

        setIsLoading(false);
        return {};
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Unexpected sign up error:', error);
        }
        setIsLoading(false);
        return { error: 'An unexpected error occurred. Please try again.' };
      }
    },
    [],
  );

  const clearNotificationRealtimeStore = useCallback(async () => {
    const { useNotificationRealtimeStore } = await import('@/store/notificationRealtimeStore');
    useNotificationRealtimeStore.getState().clearAll();
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    // Clear demo mode if active
    const demoModeStore = useDemoModeStore.getState();
    if (demoModeStore.isDemoMode || demoModeStore.demoView === 'app-preview') {
      demoModeStore.setDemoView('off');
    }

    // Clear onboarding cache to prevent stale data polluting next account
    localStorage.removeItem('chravel_onboarding_completed');

    // Clear all cached server data so next user on this device sees nothing —
    // including the persisted IDB copy (explicit delete; don't rely on the
    // persister's throttled propagation of clear()). Runs concurrently with
    // realtime teardown: both must finish before the trailing navigation, but
    // a cold IDB open mustn't serially delay sign-out.
    queryClient.clear();
    await Promise.all([
      removePersistedQueryCache(),
      // Tear down all Realtime subscriptions to prevent cross-user notification leaks
      supabase.removeAllChannels(),
    ]);

    // Clear AI concierge localStorage caches (PII — trip planning conversations)
    conciergeCacheService.clearAllCaches();

    // Reset onboarding store (dynamic import to avoid circular deps)
    import('@/store/onboardingStore').then(({ useOnboardingStore }) => {
      useOnboardingStore.getState().resetOnboarding();
    });

    // Clear notification state to prevent stale badges/data across sessions.
    // clearAll() is client-only state reset and safe to run before/after sign-out.
    await clearNotificationRealtimeStore();

    // Sign out from Supabase (no-op if not authenticated)
    logAuthEvent('logout');
    invalidateAuthCache();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);

    // Redirect to home/landing page
    window.location.href = '/';
  }, [clearNotificationRealtimeStore]);

  const resetPassword = useCallback(async (email: string): Promise<{ error?: string }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Reset password error:', error);
        }
        return { error: error.message };
      }

      logAuthEvent('password_reset_requested', { method: 'email' });
      return {};
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Auth] Unexpected reset password error:', error);
      }
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, []);

  const updateProfile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase error type is loosely typed
    async (updates: Partial<UserProfile>): Promise<{ error?: any }> => {
      if (!user) return { error: 'No user logged in' };

      try {
        // Phone is stored directly in the profiles table.
        const profileUpdates = { ...updates };

        // Use UPSERT so profile updates persist even if the profiles row was never created.
        // This is critical for avatar uploads + identity propagation.
        const { data, error } = await supabase
          .from('profiles')
          .upsert(
            {
              ...profileUpdates,
              user_id: user.id,
            },
            { onConflict: 'user_id' },
          )
          .select('*')
          .single();

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Error updating profile:', error);
          }
          return { error };
        }

        // Keep auth metadata aligned so fallback identity hydration cannot regress user-visible names.
        if (updates.display_name !== undefined || updates.real_name !== undefined) {
          const metadataUpdates: Record<string, string | null> = {};

          if (updates.display_name !== undefined) {
            metadataUpdates.display_name = updates.display_name ?? null;
          }

          if (updates.real_name !== undefined) {
            metadataUpdates.full_name = updates.real_name ?? null;
          }

          const hasMetadataUpdates = Object.keys(metadataUpdates).length > 0;
          if (hasMetadataUpdates) {
            const { error: authUpdateError } = await supabase.auth.updateUser({
              data: metadataUpdates,
            });
            if (authUpdateError && import.meta.env.DEV) {
              console.warn(
                '[Auth] Failed to sync auth metadata after profile update:',
                authUpdateError,
              );
            }
          }
        }

        // Phone is now saved directly in the profiles upsert above.

        // Update local user state
        const updatedUser = { ...user };
        // Prefer returned row to avoid local/remote drift.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase row type doesn't include all profile columns
        const row = data as any;
        if (row) {
          updatedUser.displayName = row.display_name ?? updatedUser.displayName;
          updatedUser.realName = row.real_name ?? updatedUser.realName;
          const namePref = row.name_preference;
          updatedUser.namePreference =
            namePref === 'real'
              ? 'real'
              : namePref === 'display'
                ? 'display'
                : updatedUser.namePreference;
          updatedUser.firstName = row.first_name ?? updatedUser.firstName;
          updatedUser.lastName = row.last_name ?? updatedUser.lastName;
          updatedUser.avatar = row.avatar_url ?? updatedUser.avatar;
          updatedUser.bio = row.bio ?? updatedUser.bio;
          updatedUser.phone = row.phone ?? updatedUser.phone;
          updatedUser.showEmail = row.show_email ?? updatedUser.showEmail;
          updatedUser.showPhone = row.show_phone ?? updatedUser.showPhone;
          const rowJobTitle = row.job_title;
          updatedUser.jobTitle =
            rowJobTitle !== undefined ? (rowJobTitle ?? undefined) : updatedUser.jobTitle;
          const rowShowJobTitle = row.show_job_title;
          updatedUser.showJobTitle =
            rowShowJobTitle !== undefined ? (rowShowJobTitle ?? false) : updatedUser.showJobTitle;
        } else {
          if (updates.display_name) updatedUser.displayName = updates.display_name;
          if (updates.real_name !== undefined)
            updatedUser.realName = updates.real_name ?? undefined;
          if (updates.name_preference !== undefined)
            updatedUser.namePreference = updates.name_preference === 'real' ? 'real' : 'display';
          if (updates.first_name) updatedUser.firstName = updates.first_name;
          if (updates.last_name) updatedUser.lastName = updates.last_name;
          if (updates.avatar_url) updatedUser.avatar = updates.avatar_url;
          if (updates.bio !== undefined) updatedUser.bio = updates.bio ?? undefined;
          if (updates.phone !== undefined) updatedUser.phone = updates.phone ?? undefined;
          if (updates.show_email !== undefined) updatedUser.showEmail = updates.show_email;
          if (updates.show_phone !== undefined) updatedUser.showPhone = updates.show_phone;
          const u = updates as Partial<UserProfile>;
          if (u.job_title !== undefined) updatedUser.jobTitle = u.job_title ?? undefined;
          if (u.show_job_title !== undefined) updatedUser.showJobTitle = u.show_job_title;
        }

        setUser(updatedUser);
        return {};
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating profile:', error);
        }
        return { error };
      }
    },
    [user],
  );

  const updateNotificationSettings = useCallback(
    async (updates: Partial<User['notificationSettings']>): Promise<void> => {
      if (!user) return;

      try {
        // Map User notificationSettings to NotificationPreferences format
        const prefsUpdate = {
          chat_messages: updates.messages,
          broadcasts: updates.broadcasts,
          calendar_reminders: updates.tripUpdates,
          email_enabled: updates.email,
          push_enabled: updates.push,
        };

        // Save to database using userPreferencesService
        const { userPreferencesService } = await import('@/services/userPreferencesService');
        await userPreferencesService.updateNotificationPreferences(user.id, prefsUpdate);

        // Update local user state
        const updatedUser = {
          ...user,
          notificationSettings: {
            ...user.notificationSettings,
            ...updates,
          },
        };

        setUser(updatedUser);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating notification settings:', error);
        }
      }
    },
    [user],
  );

  // switchRole is restricted to development builds only to prevent client-side privilege escalation.
  // In production, roles are derived from the server-side user_roles / organization_members tables.
  const switchRole = useCallback(
    (role: string) => {
      if (!import.meta.env.DEV) {
        console.warn('[Auth] switchRole is disabled in production builds.');
        return;
      }
      if (user) {
        const rolePermissions: Record<string, string[]> = {
          admin: ['read', 'write', 'admin', 'finance', 'compliance'],
          staff: ['read', 'write'],
          talent: ['read'],
          player: ['read'],
          crew: ['read', 'write'],
          security: ['read', 'write'],
          medical: ['read', 'write', 'medical'],
          producer: ['read', 'write', 'admin'],
          speakers: ['read'],
          guests: ['read'],
          coordinators: ['read', 'write'],
          logistics: ['read', 'write'],
          press: ['read', 'write'],
        };

        setUser({
          ...user,
          proRole: role as User['proRole'],
          permissions: rolePermissions[role] || ['read'],
        });
      }
    },
    [user],
  );

  // Memoize the context value so consumers re-render only on real auth-state
  // changes, not on every AuthProvider render. The action functions above are
  // useCallback-stable, so the only invalidators here are the exposed state fields.
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isLoading,
      isHydrated,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signInWithPhone,
      signUp,
      signOut,
      resetPassword,
      updateProfile,
      updateNotificationSettings,
      switchRole,
      authState,
      authErrorReason,
      isAuthenticated: authState === 'authenticated',
    }),
    [
      user,
      session,
      isLoading,
      isHydrated,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signInWithPhone,
      signUp,
      signOut,
      resetPassword,
      updateProfile,
      updateNotificationSettings,
      switchRole,
      authState,
      authErrorReason,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useOptionalAuth = () => {
  return useContext(AuthContext) ?? null;
};
