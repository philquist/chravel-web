import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import type { User } from '@supabase/supabase-js';
import {
  reportStreamMembershipSyncFailure,
  syncAddMemberToTripChannels,
} from '@/services/stream/streamMembershipCoordinator';
import { syncTripMemberToStreamAndEmitMemberJoined } from '@/lib/streamTripMemberInlineActivity';
import { toast } from 'sonner';
import {
  Users,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  LogIn,
  UserPlus,
  RefreshCw,
  Mail,
  ArrowRight,
  Lock,
  WifiOff,
  UserX,
  Star,
} from 'lucide-react';
import { CalendarGlyph } from '../components/ui/CalendarGlyph';
import {
  InviteError,
  INVITE_ERROR_SPECS,
  normalizeErrorCode,
  createInviteError,
} from '../types/inviteErrors';
import { invalidatePendingRequestState } from '@/hooks/pendingRequestsCache';
import {
  clearPendingInviteCode,
  getPendingInviteCode,
  storePendingInviteCode,
} from '@/lib/pendingInviteStorage';

interface InvitePreviewData {
  invite: {
    trip_id: string;
    is_active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    current_uses: number;
    require_approval: boolean;
  };
  trip: {
    name: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    cover_image_url: string | null;
    trip_type: string | null;
    member_count: number;
  };
}

function resolveAuthUserDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = (key: string): string | undefined => {
    const v = meta?.[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  };
  return (
    fromMeta('full_name') ||
    fromMeta('name') ||
    fromMeta('display_name') ||
    (user.email?.split('@')[0] ?? '').trim() ||
    'Someone'
  );
}

/**
 * Generate a contextual urgency line from trip start date.
 * Returns null if no start date or trip is in the past.
 */
function getUrgencyLine(startDate: string | null): string | null {
  if (!startDate) return null;

  const start = new Date(startDate);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();

  if (diffMs < 0) return null;

  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) return `Trip starts in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Trip starts in ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  const formatted = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `Trip starts ${formatted}`;
}

export interface JoinActionPresentation {
  ctaLabel: string;
  ctaBusyLabel: string;
  showApprovalNotice: boolean;
  signedOutPrompt: string;
}

/**
 * Join requests are approval-only on the backend. Keep the UI in the same
 * request/review framing even if legacy invite rows still carry
 * `require_approval = false`.
 */
export function getJoinActionPresentation(_requireApproval: boolean): JoinActionPresentation {
  return {
    ctaLabel: 'Request to Join',
    ctaBusyLabel: 'Requesting...',
    showApprovalNotice: true,
    signedOutPrompt: 'Sign in or create a free account to request to join this trip.',
  };
}

/**
 * Resolve the invite code from three sources (priority order):
 * 1. URL param (:token)
 * 2. shared pending invite storage (session/local mirror)
 * 3. `invite` query param
 */
function resolveInviteCode(
  token: string | undefined,
  searchParams: URLSearchParams,
): string | null {
  if (token) return token;

  const stored = getPendingInviteCode();
  if (stored) return stored;

  const fromQuery = searchParams.get('invite');
  if (fromQuery) return fromQuery;

  return null;
}

const JoinTrip = () => {
  const { token } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [inviteData, setInviteData] = useState<InvitePreviewData | null>(null);
  const [error, setError] = useState<InviteError | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | null>(null);
  const [joinSuccessType, setJoinSuccessType] = useState<'request' | 'already_member' | 'joined'>(
    'request',
  );
  const autoJoinAttemptedRef = useRef(false);

  // Triple-source invite code restoration on mount
  // If token is missing but we have the code from another source, redirect
  useEffect(() => {
    if (token) return; // URL param present — no recovery needed

    const resolved = resolveInviteCode(undefined, searchParams);
    if (resolved) {
      clearPendingInviteCode();
      navigate(`/join/${resolved}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only
  }, []);

  // Debug logging on mount
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[JoinTrip] Component mounted', {
        token,
        loading,
        hasUser: !!user,
        pathname: location.pathname,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only debug log
  }, []);

  // Safety timeout - prevent infinite loading states
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        if (!inviteData && !error) {
          setError(createInviteError('NETWORK_ERROR'));
        }
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [loading, inviteData, error]);

  // Set document head for rich link previews
  useEffect(() => {
    const tripName = inviteData?.trip.name || 'Plan Trips Better';
    const destination = inviteData?.trip.destination || 'an exciting destination';
    const imageUrl =
      inviteData?.trip.cover_image_url ||
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&h=630&fit=crop';

    document.title = inviteData?.trip.name
      ? `Join ${tripName} - ChravelApp`
      : 'Plan Trips Better - ChravelApp';

    const updateMetaTag = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    const updateMetaName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    updateMetaTag('og:title', `Join ${tripName} \u2022 ${destination}!`);
    updateMetaTag(
      'og:description',
      `\uD83D\uDCCD ${destination} \u2022 You've been invited to join a trip! Click to see details and join the adventure.`,
    );
    updateMetaTag('og:type', 'website');
    updateMetaTag('og:image', imageUrl);
    updateMetaName('twitter:card', 'summary_large_image');
    updateMetaName('twitter:title', `Join ${tripName} \u2022 ${destination}!`);
    updateMetaName(
      'twitter:description',
      `\uD83D\uDCCD ${destination} \u2022 You've been invited to join a trip! Click to see details.`,
    );
    updateMetaName('twitter:image', imageUrl);
  }, [inviteData]);

  // Check for stored invite code after login (localStorage version)
  useEffect(() => {
    const resolved = resolveInviteCode(undefined, searchParams);
    if (resolved && user && !token) {
      // User just logged in with a pending invite
      clearPendingInviteCode();
      navigate(`/join/${resolved}`, { replace: true });
    }
  }, [user, token, navigate, searchParams]);

  useEffect(() => {
    if (token) {
      checkDeepLinkAndFetchInvite();
    } else {
      setError(createInviteError('INVALID_LINK'));
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkDeepLinkAndFetchInvite depends on token already in deps
  }, [token]);

  const checkDeepLinkAndFetchInvite = async () => {
    if (!token) return;

    // ALWAYS fetch invite preview first - show the user the trip details
    // regardless of platform. Deep linking via button click is optional.
    await fetchInvitePreview();
  };

  const fetchInvitePreview = async () => {
    if (import.meta.env.DEV) {
      console.log('[JoinTrip] fetchInvitePreview called', { token });
    }

    if (!token) {
      if (import.meta.env.DEV) {
        console.warn('[JoinTrip] No token provided');
      }
      setLoading(false);
      return;
    }

    // Handle demo invite codes - redirect to auth instead of showing error
    if (token.startsWith('demo-')) {
      if (import.meta.env.DEV) {
        console.log('[JoinTrip] Demo invite code detected, redirecting to auth');
      }
      // Demo invites should redirect to sign up - they're not real invites
      navigate(`/auth?mode=signup&returnTo=${encodeURIComponent('/')}`, { replace: true });
      return;
    }

    // Validate Supabase client
    if (!supabase) {
      setError(
        createInviteError(
          'NETWORK_ERROR',
          undefined,
          'App initialization error. Please refresh the page.',
        ),
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      if (import.meta.env.DEV) {
        console.log('[JoinTrip] Invoking get-invite-preview edge function');
      }

      // Use edge function to get invite preview (works without auth)
      const { data, error: funcError } = await supabase.functions.invoke('get-invite-preview', {
        body: { code: token },
      });

      if (import.meta.env.DEV) {
        console.log('[JoinTrip] Edge function response:', { data, error: funcError });
      }

      if (funcError) {
        if (import.meta.env.DEV) {
          console.error('[JoinTrip] Edge function error:', funcError);
        }
        setError(createInviteError('NETWORK_ERROR'));
        return;
      }

      if (!data?.success) {
        if (import.meta.env.DEV) {
          console.error('[JoinTrip] Invite preview error:', data?.error);
        }
        // Normalize legacy error codes to new taxonomy
        const errorCode = normalizeErrorCode(data?.error_code);
        setError(
          createInviteError(
            errorCode,
            {
              tripId: data?.trip?.id,
              tripName: data?.trip?.name,
            },
            data?.error,
          ),
        );
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[JoinTrip] Successfully loaded invite data');
      }
      setInviteData(data);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[JoinTrip] Critical error fetching invite preview:', err);
      }
      setError(createInviteError('UNKNOWN_ERROR'));
    } finally {
      // ALWAYS stop loading regardless of success/failure
      setLoading(false);
      if (import.meta.env.DEV) {
        console.log('[JoinTrip] fetchInvitePreview completed, loading set to false');
      }
    }
  };

  // Auto-join after auth completes (P0 conversion path).
  // Only auto-attempt once per loaded invite so an expired/stale session cannot
  // loop the page into a perpetual "Requesting..." state. Users can still retry
  // manually after the automatic attempt settles.
  useEffect(() => {
    if (!user) return;
    if (!token) return;
    if (!inviteData) return;
    if (loading) return;
    if (joining) return;
    if (joinSuccess) return;
    if (autoJoinAttemptedRef.current) return;

    autoJoinAttemptedRef.current = true;
    void handleJoinTrip(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, inviteData, loading, joining, joinSuccess]);

  const handleJoinTrip = async (isAutoJoin = false) => {
    if (!user) {
      if (token) {
        storePendingInviteCode(token);
      }
      setAuthModalMode('signin');
      return;
    }

    if (!token || !inviteData) return;

    setJoining(true);
    try {
      const { data, error } = await supabase.functions.invoke('join-trip', {
        body: { inviteCode: token },
      });

      if (error) {
        // Try to extract a meaningful message from the error
        let errorMessage = 'Failed to join trip. Please try again.';
        if (error.message) {
          try {
            // Edge function errors may contain JSON body
            const parsed = JSON.parse(error.message);
            errorMessage = parsed.message || parsed.error || errorMessage;
          } catch {
            // Not JSON, use the message directly unless it's the generic non-2xx error
            if (!error.message.includes('non-2xx')) {
              errorMessage = error.message;
            }
          }
        }
        toast.error(errorMessage);
        setJoining(false);
        return;
      }

      if (!data.success) {
        toast.error(data.message || 'Failed to join trip');
        setJoining(false);
        return;
      }

      // Post-join cleanup: invalidate queries and clear stored invite code
      const tripId = data.trip_id || inviteData.invite.trip_id;

      clearPendingInviteCode();
      void invalidatePendingRequestState(queryClient, { tripId });

      if (data.requires_approval) {
        toast.success(
          data.message ||
            "Join request submitted! You'll see the trip on your home page once approved.",
        );
        setJoinSuccessType('request');
        setJoinSuccess(true);
        setJoining(false);
        // Redirect to home page after 2 seconds to show pending trip card
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 2000);
        return;
      }

      if (tripId && user?.id) {
        if (data.already_member) {
          void syncAddMemberToTripChannels(tripId, user.id).catch(error => {
            reportStreamMembershipSyncFailure(
              'add-trip-member',
              { tripId, userId: user.id },
              error,
            );
          });
        } else {
          const memberDisplayName = resolveAuthUserDisplayName(user as unknown as User);
          void syncTripMemberToStreamAndEmitMemberJoined({
            tripId,
            joiningUserId: user.id,
            memberDisplayName,
            syncFailureContext: 'join-trip-invite',
          }).catch(error => {
            reportStreamMembershipSyncFailure(
              'join-trip-inline-activity',
              { tripId, userId: user.id },
              error,
            );
          });
        }
      }

      if (data.already_member) {
        toast.info(data.message || "You're already a member!");
        setJoinSuccessType('already_member');
      } else {
        toast.success(data.message || 'Successfully joined the trip!');
        setJoinSuccessType('joined');
      }

      setJoinSuccess(true);

      setTimeout(() => {
        if (data.trip_type === 'pro') {
          navigate(`/tour/pro/${data.trip_id}`);
        } else if (data.trip_type === 'event') {
          navigate(`/event/${data.trip_id}`);
        } else {
          navigate(`/trip/${data.trip_id}`);
        }
      }, 1000);
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const openAuthModal = useCallback(
    (mode: 'signin' | 'signup') => {
      if (token) {
        storePendingInviteCode(token);
      }
      setAuthModalMode(mode);
    },
    [token],
  );

  const handleLoginRedirect = () => openAuthModal('signin');

  const handleSignupRedirect = () => openAuthModal('signup');

  const formatDateRange = () => {
    if (!inviteData?.trip.start_date) return null;
    const start = new Date(inviteData.trip.start_date);
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (inviteData.trip.end_date) {
      const end = new Date(inviteData.trip.end_date);
      const endStr = end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startStr} - ${endStr}`;
    }
    return startStr;
  };

  /**
   * Get the appropriate icon for an error code.
   * Icons are color-coded by severity: info (blue), warning (yellow), error (red).
   */
  const getErrorIcon = useCallback((error: InviteError) => {
    const spec = INVITE_ERROR_SPECS[error.code];
    const iconClass = 'h-12 w-12 mx-auto mb-4';

    const colorClass =
      spec.severity === 'error'
        ? 'text-red-400'
        : spec.severity === 'warning'
          ? 'text-gold-primary'
          : 'text-blue-400';

    switch (spec.icon) {
      case 'auth':
        return <LogIn className={`${iconClass} ${colorClass}`} />;
      case 'clock':
        return <Clock className={`${iconClass} ${colorClass}`} />;
      case 'lock':
        return <Lock className={`${iconClass} ${colorClass}`} />;
      case 'users':
        return <Users className={`${iconClass} ${colorClass}`} />;
      case 'network':
        return <WifiOff className={`${iconClass} ${colorClass}`} />;
      case 'check':
        return <CheckCircle2 className={`${iconClass} text-green-400`} />;
      default:
        return <AlertCircle className={`${iconClass} ${colorClass}`} />;
    }
  }, []);

  /**
   * Handle CTA button clicks based on error action type.
   * Each CTA maps to a specific recovery action.
   */
  const handleErrorCTA = useCallback(
    (action: string, errorData?: InviteError['metadata']) => {
      switch (action) {
        case 'login':
          openAuthModal('signin');
          break;
        case 'signup':
          openAuthModal('signup');
          break;
        case 'switch_account':
          // Sign out and redirect to login with invite preserved
          if (token) {
            storePendingInviteCode(token);
          }
          supabase.auth.signOut().then(() => {
            setAuthModalMode('signin');
          });
          break;
        case 'request_new_invite':
          // Show toast with guidance and redirect to dashboard
          toast.info('Contact the trip organizer for a new invite link.');
          navigate('/');
          break;
        case 'contact_host':
          toast.info('Contact the trip organizer for help.');
          navigate('/');
          break;
        case 'go_to_dashboard':
          navigate('/');
          break;
        case 'retry':
          setError(null);
          setLoading(true);
          void fetchInvitePreview();
          break;
        case 'view_request_status':
          // Navigate to home where pending requests are shown
          navigate('/');
          break;
        case 'open_trip':
          if (errorData?.tripId) {
            const tripType = errorData.tripType || 'consumer';
            if (tripType === 'pro') {
              navigate(`/tour/pro/${errorData.tripId}`);
            } else if (tripType === 'event') {
              navigate(`/event/${errorData.tripId}`);
            } else {
              navigate(`/trip/${errorData.tripId}`);
            }
          } else {
            navigate('/');
          }
          break;
        default:
          navigate('/');
      }
    },
    [fetchInvitePreview, navigate, openAuthModal, token],
  );

  /**
   * Get CTA button label based on action type.
   */
  const getCTALabel = useCallback((action: string): string => {
    const labels: Record<string, string> = {
      login: 'Log In',
      signup: 'Sign Up',
      switch_account: 'Switch Account',
      request_new_invite: 'Request New Invite',
      contact_host: 'Contact Host',
      go_to_dashboard: 'Go to Dashboard',
      retry: 'Try Again',
      view_request_status: 'View Request Status',
      open_trip: 'Open Trip',
    };
    return labels[action] || 'Continue';
  }, []);

  /**
   * Get CTA button icon based on action type.
   */
  const getCTAIcon = useCallback((action: string) => {
    switch (action) {
      case 'login':
        return <LogIn className="h-4 w-4" />;
      case 'signup':
        return <UserPlus className="h-4 w-4" />;
      case 'switch_account':
        return <UserX className="h-4 w-4" />;
      case 'request_new_invite':
      case 'contact_host':
        return <Mail className="h-4 w-4" />;
      case 'retry':
        return <RefreshCw className="h-4 w-4" />;
      case 'open_trip':
      case 'view_request_status':
        return <ArrowRight className="h-4 w-4" />;
      default:
        return null;
    }
  }, []);

  // Show loading ONLY while fetching invite data.
  // DO NOT block on auth hydration - unauthenticated users should see preview immediately.
  if (loading) {
    if (import.meta.env.DEV) {
      console.log('[JoinTrip] Rendering loading state');
    }
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-4 animate-spin gold-gradient-spinner" />
          <p className="text-white/70">Loading invite details...</p>
        </div>
      </div>
    );
  }

  // Fallback for when loading is done but no data and no error
  if (!inviteData && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-xl">
          <WifiOff className="h-12 w-12 text-gold-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
          <p className="text-white/60 mb-6">
            We couldn't load the invite details. Please try again.
          </p>
          <button
            onClick={() => {
              setLoading(true);
              void fetchInvitePreview();
            }}
            className="w-full accent-fill-gold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-3 w-full bg-white/8 hover:bg-white/12 border border-white/15 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    const spec = INVITE_ERROR_SPECS[error.code];
    const primaryCTA = error.primaryCTA || spec.primaryCTA;
    const secondaryCTA = error.secondaryCTA || spec.secondaryCTA;

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
          {getErrorIcon(error)}
          <h1 className="text-2xl font-bold text-white mb-4">{error.title}</h1>
          <p className="text-white/60 mb-6">{error.message}</p>

          {/* Trip context if available */}
          {error.metadata?.tripName && (
            <div className="mb-6 p-3 bg-white/5 border border-white/10 rounded-xl">
              <p className="text-sm text-white/60">
                Trip: <span className="text-white font-medium">{error.metadata.tripName}</span>
              </p>
            </div>
          )}

          {/* Account mismatch context */}
          {error.code === 'ACCOUNT_MISMATCH' && error.metadata?.invitedEmail && (
            <div className="mb-6 p-3 bg-gold-primary/10 border border-gold-primary/20 rounded-xl">
              <p className="text-sm text-gold-primary">
                Invite sent to: <span className="font-medium">{error.metadata.invitedEmail}</span>
              </p>
              {error.metadata.currentEmail && (
                <p className="text-sm text-white/60 mt-1">
                  Logged in as: <span className="font-medium">{error.metadata.currentEmail}</span>
                </p>
              )}
            </div>
          )}

          {/* Primary CTA Button */}
          <button
            onClick={() => handleErrorCTA(primaryCTA, error.metadata)}
            className="w-full accent-fill-gold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium"
          >
            {getCTAIcon(primaryCTA)}
            {getCTALabel(primaryCTA)}
          </button>

          {/* Secondary CTA Button */}
          {secondaryCTA && (
            <button
              onClick={() => handleErrorCTA(secondaryCTA, error.metadata)}
              className="mt-3 w-full bg-white/8 hover:bg-white/12 border border-white/15 text-white px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {getCTAIcon(secondaryCTA)}
              {getCTALabel(secondaryCTA)}
            </button>
          )}

          {/* Help text for certain errors */}
          {(error.code === 'INVITE_EXPIRED' ||
            error.code === 'INVITE_INACTIVE' ||
            error.code === 'INVITE_MAX_USES') && (
            <p className="mt-4 text-xs text-white/40">
              Tip: Ask the trip organizer to send you a new invite link.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (joinSuccess) {
    const tripName = inviteData?.trip.name || 'the trip';
    const successContent = {
      request: {
        title: 'Request Submitted!',
        message: `Your request to join ${tripName} has been sent. A trip member will review it soon.`,
      },
      already_member: {
        title: 'Already a Member!',
        message: `You're already a member of ${tripName}. Taking you there now.`,
      },
      joined: {
        title: `You've joined ${tripName}!`,
        message: 'Taking you to the trip now.',
      },
    }[joinSuccessType];

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-4">{successContent.title}</h1>
          <p className="text-white/60 mb-6">{successContent.message}</p>
          <div className="h-6 w-6 mx-auto animate-spin gold-gradient-spinner" />
          <p className="text-sm text-white/40 mt-2">Redirecting...</p>
        </div>
      </div>
    );
  }

  const defaultCoverImage =
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=400&fit=crop';
  const coverImage = inviteData?.trip.cover_image_url || defaultCoverImage;
  const inviteReturnTo = token ? `/join/${encodeURIComponent(token)}` : location.pathname;
  // Default to approval framing when the flag is missing — the join-trip edge
  // function routes joins through approval unless the invite says otherwise.
  const joinPresentation = getJoinActionPresentation(inviteData?.invite.require_approval ?? true);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl overflow-hidden max-w-md w-full">
        {/* Cover Image */}
        <div className="relative h-48 overflow-hidden">
          <img
            src={coverImage}
            alt={inviteData?.trip.name || 'Trip'}
            className="w-full h-full object-cover"
            onError={e => {
              if (e.currentTarget.src !== defaultCoverImage) {
                e.currentTarget.src = defaultCoverImage;
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent" />
          <div className="absolute top-4 left-4 z-10">
            <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full">
              <span className="text-gold-primary font-bold text-lg">ChravelApp</span>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-white">
              {inviteData?.trip.name || 'Trip Invitation'}
            </h1>
            {inviteData?.trip.destination && (
              <div className="flex items-center gap-1 text-white/80 mt-1">
                <MapPin size={14} />
                <span className="text-sm">{inviteData.trip.destination}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {/* Trip Info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 space-y-3">
            {formatDateRange() && (
              <div className="flex items-center gap-3 text-sm">
                <CalendarGlyph size={16} className="gold-gradient-icon" />
                <span className="text-white">{formatDateRange()}</span>
              </div>
            )}

            {inviteData?.trip.member_count !== undefined && (
              <div className="flex items-center gap-3 text-sm">
                <Users size={16} className="gold-gradient-icon" />
                <span className="text-white">
                  {inviteData.trip.member_count}{' '}
                  {inviteData.trip.member_count === 1 ? 'Chraveler' : 'Chravelers already planning'}
                </span>
              </div>
            )}

            {inviteData?.trip.trip_type && inviteData.trip.trip_type !== 'consumer' && (
              <div className="inline-flex px-2 py-1 bg-gold-primary/10 text-gold-primary text-xs font-medium rounded-full border border-gold-primary/20">
                {inviteData.trip.trip_type === 'pro' ? 'Pro Trip' : 'Event'}
              </div>
            )}

            {inviteData?.invite.expires_at && (
              <div className="flex items-center gap-3 text-xs text-white/50">
                <Clock size={14} />
                <span>
                  Invite expires: {new Date(inviteData.invite.expires_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Urgency line */}
          {(() => {
            const urgency = getUrgencyLine(inviteData?.trip.start_date ?? null);
            if (!urgency) return null;
            return (
              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-gold-primary/10 border border-gold-primary/20 rounded-xl">
                <Star size={14} className="text-gold-primary flex-shrink-0" />
                <span className="text-gold-primary text-sm font-medium">{urgency}</span>
              </div>
            );
          })()}

          {/* Actions */}
          {!user ? (
            <div className="space-y-4">
              <p className="text-white/70 text-center text-sm">
                {joinPresentation.signedOutPrompt}
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleSignupRedirect}
                  className="w-full accent-fill-gold py-3 px-6 rounded-xl transition-all duration-200 font-medium"
                >
                  Continue to Sign Up
                </button>
                <button
                  onClick={handleLoginRedirect}
                  className="w-full bg-white/8 hover:bg-white/12 border border-white/15 text-white py-3 px-6 rounded-xl transition-colors"
                >
                  Already have an account? Log In
                </button>
              </div>
              <p className="text-white/40 text-center text-xs">
                You can use Google, Apple, or email.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => handleJoinTrip()}
                disabled={joining}
                className="w-full accent-fill-gold py-4 px-6 rounded-xl transition-all duration-200 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {joining ? (
                  <>
                    <div className="h-4 w-4 animate-spin gold-gradient-spinner" />
                    {joinPresentation.ctaBusyLabel}
                  </>
                ) : (
                  joinPresentation.ctaLabel
                )}
              </button>

              <button
                onClick={() => navigate('/')}
                className="w-full bg-white/8 hover:bg-white/12 border border-white/15 text-white py-3 px-6 rounded-xl transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {!joining && user && joinPresentation.showApprovalNotice && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-blue-400" />
                <p className="font-medium text-blue-400">Member Approval</p>
              </div>
              <p className="text-blue-400/80 text-sm">
                A current trip member will review your request. You'll be notified once approved.
              </p>
            </div>
          )}
        </div>
      </div>
      <AuthModal
        isOpen={authModalMode !== null}
        initialMode={authModalMode ?? 'signin'}
        oauthReturnTo={inviteReturnTo}
        onClose={() => {
          clearPendingInviteCode();
          setAuthModalMode(null);
        }}
      />
    </div>
  );
};

export default JoinTrip;
