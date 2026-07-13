/**
 * useStreamTripChat — Stream-backed trip chat hook
 *
 * Drop-in replacement for the Supabase-backed useTripChat.
 * Returns the exact same shape so TripChat.tsx and all downstream
 * components work without changes.
 *
 * Architecture:
 *   - Uses stream-chat JS client (low-level, no UI components)
 *   - Messages are transformed via messageMapper to match TripChatMessage shape
 *   - Realtime delivery via Stream WebSocket (replaces dual-path broadcast+CDC)
 *   - Read state, typing, reactions handled by Stream built-ins
 *   - Offline support via Stream SDK's built-in persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  connectStreamClient,
  getStreamClient,
  onStreamClientConnected,
  onStreamClientConnectionStatusChange,
} from '@/services/stream/streamClient';
import { CHANNEL_TYPE_TRIP, tripChannelId } from '@/services/stream/streamChannelFactory';
import { messageEvents, streamReliabilityEvents } from '@/telemetry/events';
import { telemetry } from '@/telemetry/service';
import type { Channel, Event, MessageResponse } from 'stream-chat';
import { buildTripStreamMessagePayload } from '@/services/stream/streamMessagePayload';
import type { StreamQuotedReferenceInput } from '@/services/stream/streamMessagePayload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  isStreamCanaryEnabledForUser,
  reportStreamCanaryIncident,
} from '@/services/stream/streamCanary';
import { sortMessagesWithCanonicalOrdering } from './messageEventModel';
import { capPrependedMessages, capRetainedMessages } from '@/lib/chatMessageRetention';
import { isDeletedStreamMessage, withTimeout } from '@/hooks/stream/streamChatUtils';

const PAGE_SIZE = 30;
// Max time to wait for the Stream client to connect, and to bound a single channel.watch()
// call, before surfacing a terminal error + Retry instead of an infinite skeleton.
const CONNECT_TIMEOUT_MS = 10000;
const WATCH_TIMEOUT_MS = 15000;
type StreamSendPayload = Parameters<Channel['sendMessage']>[0];
const MEMBERSHIP_ERROR_MESSAGE =
  'We could not verify your trip chat access. Please refresh and try again.';

type MembershipFailureCode =
  | 'join_failed'
  | 'join_timeout'
  | 'membership_denied'
  | 'stream_api_failure'
  | 'invalid_response'
  | 'unknown';

type MembershipFailure = {
  code: MembershipFailureCode;
  reasonCode?: string;
  reason: string;
};

type MembershipRecoveryResult =
  | { ok: true }
  | {
      ok: false;
      failure: MembershipFailure;
    };

export function isStreamReadChannelPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ReadChannel|read-channel|GetOrCreateChannel failed|error code 17/i.test(message);
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted/i.test(message);
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractMembershipFailure(value: unknown): MembershipFailure | null {
  if (!value || typeof value !== 'object') return null;
  const code = toNonEmptyString((value as { code?: unknown }).code);
  const reasonCode = toNonEmptyString((value as { reasonCode?: unknown }).reasonCode);
  const reason = toNonEmptyString((value as { reason?: unknown }).reason);
  if (!code && !reasonCode && !reason) return null;
  return {
    code: (code as MembershipFailureCode | null) ?? 'unknown',
    reasonCode: reasonCode ?? undefined,
    reason: reason ?? 'Membership recovery failed',
  };
}

function mapMembershipFailureToUiError(failure: MembershipFailure): Error {
  if (
    (failure.code as string) === 'membership_denied' ||
    (failure.code as string) === 'membership_required' ||
    failure.reasonCode === 'trip_membership_required'
  ) {
    return new Error(
      'You no longer have access to this trip chat. Ask the trip organizer to re-add you.',
    );
  }
  return new Error(MEMBERSHIP_ERROR_MESSAGE);
}

function isStreamCreateMentionPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /CreateMention|action CreateMention/i.test(message);
}

type StreamGrantConfig = {
  grants?: Record<string, string[] | undefined>;
};

function channelMentionCapability(channel: Channel): boolean | null {
  const ownCapabilities =
    (
      channel as unknown as {
        data?: { own_capabilities?: string[] };
        state?: { own_capabilities?: string[]; ownCapabilities?: string[] };
      }
    ).data?.own_capabilities ??
    (
      channel as unknown as {
        state?: { own_capabilities?: string[]; ownCapabilities?: string[] };
      }
    ).state?.own_capabilities ??
    (
      channel as unknown as {
        state?: { own_capabilities?: string[]; ownCapabilities?: string[] };
      }
    ).state?.ownCapabilities;

  if (Array.isArray(ownCapabilities) && ownCapabilities.length > 0) {
    const normalized = new Set(ownCapabilities.map(cap => cap.toLowerCase()));
    return normalized.has('create-mention') || normalized.has('createmention');
  }

  const getConfig = (
    channel as unknown as {
      getConfig?: () => StreamGrantConfig | undefined;
    }
  ).getConfig;
  const config = typeof getConfig === 'function' ? getConfig() : undefined;
  const grants = config?.grants ?? {};
  const grantLists = Object.values(grants).filter((roleGrants): roleGrants is string[] =>
    Array.isArray(roleGrants),
  );
  if (grantLists.length === 0) return null;

  return grantLists.some(roleGrants =>
    roleGrants.some(grant => {
      const normalized = grant.toLowerCase();
      return normalized === 'create-mention' || normalized === 'createmention';
    }),
  );
}

function isStreamReactionPolicyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /reaction|AddReaction|DeleteReaction|CreateReaction|reactions? disabled|not allowed/i.test(
    message,
  );
}

function hasMentionedUsers(payload: StreamSendPayload): payload is StreamSendPayload & {
  mentioned_users: string[];
} {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'mentioned_users' in payload &&
    Array.isArray((payload as { mentioned_users?: unknown }).mentioned_users) &&
    ((payload as { mentioned_users?: unknown[] }).mentioned_users?.length || 0) > 0
  );
}

function withoutMentionedUsers(payload: StreamSendPayload): StreamSendPayload {
  const { mentioned_users: _mentionedUsers, ...rest } = payload as StreamSendPayload & {
    mentioned_users?: unknown;
  };
  return rest as StreamSendPayload;
}

async function sendMessageWithMentionFallback(
  channel: Channel,
  payload: StreamSendPayload,
  onMentionFallback?: () => void,
) {
  if (hasMentionedUsers(payload)) {
    const mentionCapability = channelMentionCapability(channel);
    if (mentionCapability === false) {
      if (import.meta.env.DEV) {
        console.warn(
          '[Stream] Mention capability unavailable for this channel; sending without mentioned_users',
        );
      }
      return channel.sendMessage(withoutMentionedUsers(payload));
    }
  }

  try {
    return await channel.sendMessage(payload);
  } catch (err) {
    if (isStreamCreateMentionPermissionError(err) && hasMentionedUsers(payload)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[Stream] CreateMention denied; retrying send without mentioned_users payload',
        );
      }
      onMentionFallback?.();
      return channel.sendMessage(withoutMentionedUsers(payload));
    }
    throw err;
  }
}

/**
 * Stream-backed trip chat hook.
 * Return type matches useTripChat exactly for seamless routing.
 */
export const useStreamTripChat = (tripId: string | undefined, options?: { enabled?: boolean }) => {
  const isEnabled = options?.enabled !== false;
  const { toast } = useToast();
  const { user } = useAuth();

  // Return native MessageResponse objects directly to take advantage of Stream capabilities
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [streamClientReady, setStreamClientReady] = useState(Boolean(getStreamClient()?.userID));
  const [streamCanaryEnabled, setStreamCanaryEnabled] = useState(false);

  const channelRef = useRef<Channel | null>(null);
  const messagesRef = useRef<MessageResponse[]>([]);
  const hasHydratedMessagesRef = useRef(false);
  const lastConfirmedCursorRef = useRef<{ id: string; createdAt: string } | null>(null);
  const reconnectBackfillInFlightRef = useRef<Promise<void> | null>(null);
  const lastReconnectBackfillAtRef = useRef(0);
  // Absolute connect deadline (ms epoch), armed once per trip. A reconnect flap must NOT
  // extend it — otherwise the "waiting for connection" timeout keeps re-arming and the
  // loading skeleton never resolves.
  const connectDeadlineRef = useRef<number | null>(null);
  // State mirror of channelRef for triggering the event subscription effect
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const isMountedRef = useRef(true);
  const membershipRecoveryAttemptedRef = useRef(false);
  const membershipRecoveryCountRef = useRef(0);
  const guardedReloadAttemptedRef = useRef(false);
  const membershipFailureRef = useRef<MembershipFailure | null>(null);
  const ownReactionTypesByMessageRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingIdempotencyKeysRef = useRef<Set<string>>(new Set());
  const [reloadSeed, setReloadSeed] = useState(0);
  const chatOpenAtMsRef = useRef(Date.now());
  const firstMessageTrackedRef = useRef(false);

  const trackMembershipTelemetry = useCallback(
    (
      stage: 'join_preflight' | 'ensure_membership',
      outcome: 'attempt' | 'success' | 'failure',
      details?: Record<string, string>,
    ) => {
      if (!tripId) return;
      (telemetry.track as any)('stream_membership_recovery', {
        trip_id: tripId,
        stage,
        outcome,
        ...details,
      });
    },
    [tripId],
  );

  useEffect(() => {
    let cancelled = false;

    const resolveCanary = async () => {
      const enabled = await isStreamCanaryEnabledForUser(user);
      if (!cancelled) {
        setStreamCanaryEnabled(enabled);
      }
    };

    void resolveCanary();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reportCanaryIncident = useCallback(
    (
      metric:
        | 'read_channel_denied'
        | 'send_message_failure'
        | 'reconnect_backfill_mismatch'
        | 'mention_notification_failure',
      context?: Record<string, unknown>,
    ) => {
      if (!streamCanaryEnabled) return;
      void reportStreamCanaryIncident({
        metric,
        tripId,
        context,
      });
    },
    [streamCanaryEnabled, tripId],
  );

  const triggerGuardedReload = useCallback(() => {
    if (guardedReloadAttemptedRef.current) return;
    guardedReloadAttemptedRef.current = true;
    setReloadSeed(prev => prev + 1);
  }, []);

  const trackTimeToFirstMessage = useCallback(
    (source: 'initial_history' | 'realtime_new') => {
      if (!tripId || firstMessageTrackedRef.current) return;
      firstMessageTrackedRef.current = true;
      const elapsed = Date.now() - chatOpenAtMsRef.current;
      streamReliabilityEvents.timeToFirstMessage(tripId, Math.max(elapsed, 0), source);
    },
    [tripId],
  );

  const mergeMessagesById = useCallback((nextMessages: MessageResponse[]) => {
    setMessages(prev => {
      if (nextMessages.length === 0) return prev;
      const byId = new Map(prev.map(message => [message.id, message]));
      for (const message of nextMessages) {
        // Stream returns soft-deleted messages (deleted_at set / type 'deleted') on reload,
        // loadMore, and reconnect backfill. Drop them so a deleted message can't reappear as
        // an empty bubble after any refresh.
        if (isDeletedStreamMessage(message)) {
          byId.delete(message.id);
        } else {
          byId.set(message.id, message);
        }
      }
      return capRetainedMessages(sortMessagesWithCanonicalOrdering(Array.from(byId.values())));
    });
  }, []);

  // Backfill messages missed during WebSocket disconnection (agent memory #13)
  const backfillMissedMessages = useCallback(
    async (source: 'socket_reconnect' | 'visibility_resume') => {
      const now = Date.now();
      if (reconnectBackfillInFlightRef.current) return reconnectBackfillInFlightRef.current;
      if (now - lastReconnectBackfillAtRef.current < 1000) return;

      const channel = channelRef.current;
      const cursor = lastConfirmedCursorRef.current;
      if (!channel || !cursor || !isMountedRef.current || !tripId) return;

      const run = (async () => {
        try {
          lastReconnectBackfillAtRef.current = now;
          const response = await channel.query({
            messages: {
              created_at_after: cursor.createdAt,
              limit: 100,
            },
          });
          const fetchedMessages = (response.messages || []) as MessageResponse[];
          streamReliabilityEvents.reconnectBackfill(tripId, source, fetchedMessages.length);
          mergeMessagesById(fetchedMessages);
        } catch (err) {
          reportCanaryIncident('reconnect_backfill_mismatch', {
            reason: err instanceof Error ? err.message : 'backfill_query_failed',
          });
          if (import.meta.env.DEV) {
            console.warn('[Stream] backfill failed:', err);
          }
        } finally {
          reconnectBackfillInFlightRef.current = null;
        }
      })();
      reconnectBackfillInFlightRef.current = run;
      return run;
    },
    [mergeMessagesById, reportCanaryIncident, tripId],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onStreamClientConnected(() => {
      setStreamClientReady(true);
    });

    return unsubscribe;
  }, []);

  // On reconnect, backfill messages that may have been missed during disconnection
  useEffect(() => {
    const unsubscribe = onStreamClientConnectionStatusChange(isConnected => {
      if (!isMountedRef.current) return;
      setStreamClientReady(isConnected);

      if (isConnected && hasHydratedMessagesRef.current) {
        void backfillMissedMessages('socket_reconnect');
      }
    });
    return unsubscribe;
  }, [backfillMissedMessages]);

  // Backfill on visibility change (mobile background/foreground transitions)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && hasHydratedMessagesRef.current) {
        void backfillMissedMessages('visibility_resume');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [backfillMissedMessages]);

  useEffect(() => {
    if (!isEnabled || !tripId || streamClientReady || getStreamClient()?.userID) return;

    let cancelled = false;
    void connectStreamClient().then(client => {
      if (cancelled) return;
      if (client?.userID) {
        setStreamClientReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isEnabled, tripId, streamClientReady, reloadSeed]);

  useEffect(() => {
    if (!isEnabled || !tripId) return;

    if (streamClientReady && getStreamClient()?.userID) {
      // Connected — clear any pending connect deadline so a later drop starts fresh.
      connectDeadlineRef.current = null;
      return;
    }

    // Arm the deadline ONCE; re-runs (from streamClientReady flapping) re-arm the timer
    // against the SAME fixed deadline rather than extending it, so a reconnect flap can no
    // longer keep the skeleton spinning forever. Total wait is bounded to CONNECT_TIMEOUT_MS
    // from the first not-ready render.
    if (connectDeadlineRef.current === null) {
      connectDeadlineRef.current = Date.now() + CONNECT_TIMEOUT_MS;
    }
    const remaining = Math.max(0, connectDeadlineRef.current - Date.now());

    const timer = window.setTimeout(() => {
      if (streamClientReady || getStreamClient()?.userID) return;
      setError(new Error('Timed out waiting for chat connection'));
      setIsLoading(false);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [isEnabled, tripId, streamClientReady]);

  useEffect(() => {
    membershipRecoveryAttemptedRef.current = false;
    membershipRecoveryCountRef.current = 0;
    guardedReloadAttemptedRef.current = false;
    membershipFailureRef.current = null;
    hasHydratedMessagesRef.current = false;
    ownReactionTypesByMessageRef.current.clear();
    firstMessageTrackedRef.current = false;
    chatOpenAtMsRef.current = Date.now();
    lastConfirmedCursorRef.current = null;
    reconnectBackfillInFlightRef.current = null;
    lastReconnectBackfillAtRef.current = 0;
    connectDeadlineRef.current = null;
  }, [tripId]);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length > 0) {
      hasHydratedMessagesRef.current = true;
      const latestMsg = messages[messages.length - 1];
      if (latestMsg?.id && latestMsg?.created_at) {
        lastConfirmedCursorRef.current = {
          id: latestMsg.id,
          createdAt: latestMsg.created_at,
        };
      }
    }
  }, [messages]);

  // Initialize channel and load messages
  useEffect(() => {
    if (!tripId || !isEnabled) {
      setIsLoading(false);
      return;
    }

    const client = getStreamClient();
    if (!client?.userID || !streamClientReady) {
      return;
    }

    let cancelled = false;

    const init = async () => {
      const watchChannel = async () => {
        // Ensure the user is a Stream channel member before watching.
        // Stream error code 17 means the user has role 'user' (not 'channel_member')
        // and cannot ReadChannel. We call the server-side join function to add them,
        // then retry. This also runs proactively on every init to handle users who
        // joined the trip before Stream membership sync was in place.
        const supabaseSession = (await import('@/integrations/supabase/client')).supabase.auth;
        const { data: sessionData } = await supabaseSession.getSession();
        const jwt = sessionData?.session?.access_token;

        if (jwt) {
          membershipRecoveryCountRef.current += 1;
          streamReliabilityEvents.membershipRecoveryAttempt(
            tripId,
            'join_preflight',
            membershipRecoveryCountRef.current,
          );
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 3000);
          try {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-join-channel`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${jwt}`,
                  'Content-Type': 'application/json',
                  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ tripId }),
                signal: controller.signal,
              },
            );

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as unknown;
              const failure =
                extractMembershipFailure(payload) ??
                ({
                  code: 'join_failed',
                  reason: `stream-join-channel returned ${response.status}`,
                } satisfies MembershipFailure);
              membershipFailureRef.current = failure;
              trackMembershipTelemetry('join_preflight', 'failure', {
                code: failure.code,
                reason_code: failure.reasonCode ?? 'unknown',
              });
              if (import.meta.env.DEV) {
                console.warn('[Stream] stream-join-channel returned non-OK', failure);
              }
            } else {
              membershipFailureRef.current = null;
              trackMembershipTelemetry('join_preflight', 'success');
            }
          } catch (joinErr) {
            const failure: MembershipFailure = isAbortLikeError(joinErr)
              ? { code: 'join_timeout', reason: 'stream-join-channel timed out' }
              : {
                  code: 'join_failed',
                  reason:
                    joinErr instanceof Error
                      ? joinErr.message
                      : 'stream-join-channel request failed',
                };
            membershipFailureRef.current = failure;
            trackMembershipTelemetry('join_preflight', 'failure', {
              code: failure.code,
              reason_code: failure.reasonCode ?? 'unknown',
            });
            // Join is best-effort before watch; deterministic recovery is handled on ReadChannel errors.
            if (import.meta.env.DEV) {
              console.warn('[Stream] stream-join-channel failed before watch; continuing', failure);
            }
          } finally {
            window.clearTimeout(timeout);
          }
        }

        if (cancelled) return null;

        const channel = client.channel(CHANNEL_TYPE_TRIP, tripChannelId(tripId));
        const state = await withTimeout(
          channel.watch({ state: true, messages: { limit: PAGE_SIZE } }),
          WATCH_TIMEOUT_MS,
          'channel.watch',
        );
        return { channel, state };
      };

      const ensureMembership = async (): Promise<MembershipRecoveryResult> => {
        trackMembershipTelemetry('ensure_membership', 'attempt');
        membershipRecoveryCountRef.current += 1;
        streamReliabilityEvents.membershipRecoveryAttempt(
          tripId,
          'ensure_membership',
          membershipRecoveryCountRef.current,
        );
        const response = await supabase.functions.invoke('stream-ensure-membership', {
          body: { tripId, userId: client.userID },
        });

        if (response.error) {
          trackMembershipTelemetry('ensure_membership', 'failure', {
            code: 'stream_api_failure',
            reason_code: 'stream_membership_sync_failed',
          });
          return {
            ok: false,
            failure: {
              code: 'stream_api_failure',
              reason: response.error.message || 'stream-ensure-membership invocation failed',
            },
          };
        }

        if (!response.data || typeof response.data !== 'object') {
          trackMembershipTelemetry('ensure_membership', 'failure', {
            code: 'invalid_response',
            reason_code: 'invalid_response',
          });
          return {
            ok: false,
            failure: {
              code: 'invalid_response',
              reason: 'stream-ensure-membership returned an invalid response body',
            },
          };
        }

        const parsed = response.data as {
          success?: unknown;
          code?: unknown;
          reasonCode?: unknown;
          reason?: unknown;
        };

        if (parsed.success === true) {
          membershipFailureRef.current = null;
          trackMembershipTelemetry('ensure_membership', 'success', {
            code: toNonEmptyString(parsed.code) ?? 'ok',
            reason_code: toNonEmptyString(parsed.reasonCode) ?? 'stream_membership_synced',
          });
          return { ok: true };
        }

        const failure = extractMembershipFailure(parsed) ?? {
          code: 'invalid_response',
          reason: 'stream-ensure-membership did not return success=true',
        };
        trackMembershipTelemetry('ensure_membership', 'failure', {
          code: failure.code,
          reason_code: failure.reasonCode ?? 'unknown',
        });
        return {
          ok: false,
          failure,
        };
      };

      try {
        const watched = await watchChannel();
        if (!watched || cancelled) return;

        const streamMessages = ((watched.state.messages || []) as MessageResponse[]).filter(
          m => !isDeletedStreamMessage(m),
        );
        const sortedMessages = [...streamMessages].sort((a, b) => {
          const aDate = new Date(a.created_at || 0).getTime();
          const bDate = new Date(b.created_at || 0).getTime();
          return aDate - bDate;
        });

        if (cancelled) return;

        channelRef.current = watched.channel;
        setActiveChannel(watched.channel);

        if (streamMessages.length > 0) {
          trackTimeToFirstMessage('initial_history');
          setMessages(sortedMessages);
        } else if (!hasHydratedMessagesRef.current) {
          // First load can legitimately be empty; preserve hydrated state on re-watch.
          setMessages([]);
        }
        setHasMore(streamMessages.length === PAGE_SIZE);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        let resolvedError: unknown = err;

        if (
          isStreamReadChannelPermissionError(resolvedError) &&
          !membershipRecoveryAttemptedRef.current
        ) {
          membershipRecoveryAttemptedRef.current = true;
          try {
            const ensured = await ensureMembership();
            if (ensured.ok === false) {
              throw mapMembershipFailureToUiError(ensured.failure);
            }
            const channel = client.channel(CHANNEL_TYPE_TRIP, tripChannelId(tripId));
            const state = await withTimeout(
              channel.watch({ state: true, messages: { limit: PAGE_SIZE } }),
              WATCH_TIMEOUT_MS,
              'channel.watch',
            );
            const streamMessages = ((state.messages || []) as MessageResponse[]).filter(
              m => !isDeletedStreamMessage(m),
            );
            const sortedMessages = [...streamMessages].sort((a, b) => {
              const aDate = new Date(a.created_at || 0).getTime();
              const bDate = new Date(b.created_at || 0).getTime();
              return aDate - bDate;
            });

            if (!cancelled) {
              channelRef.current = channel;
              setActiveChannel(channel);
              if (streamMessages.length > 0) {
                setMessages(sortedMessages);
              } else if (!hasHydratedMessagesRef.current) {
                setMessages([]);
              }
              setHasMore(streamMessages.length === PAGE_SIZE);
              setError(null);
              setIsLoading(false);
            }
            return;
          } catch (membershipErr) {
            const failure = membershipFailureRef.current;
            if (import.meta.env.DEV && failure) {
              console.warn('[Stream] membership recovery failed', failure);
            }
            resolvedError = membershipErr;
          }
        }

        if (isStreamReadChannelPermissionError(resolvedError)) {
          reportCanaryIncident('read_channel_denied', {
            reason: resolvedError instanceof Error ? resolvedError.message : 'read_channel_denied',
          });
          setError(
            mapMembershipFailureToUiError(
              membershipFailureRef.current ?? { code: 'unknown', reason: 'ReadChannel denied' },
            ),
          );
          triggerGuardedReload();
          setIsLoading(false);
          return;
        }

        const genericMessage =
          resolvedError instanceof Error ? resolvedError.message : 'Failed to connect to chat';
        setError(new Error(genericMessage));
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        channelRef.current.stopWatching();
        channelRef.current = null;
        setActiveChannel(null);
      }
    };
  }, [
    tripId,
    isEnabled,
    streamClientReady,
    reloadSeed,
    triggerGuardedReload,
    trackMembershipTelemetry,
    trackTimeToFirstMessage,
  ]);

  const reload = useCallback(async () => {
    if (!tripId || !isEnabled) return;

    if (!channelRef.current) {
      setError(null);
      setIsLoading(true);
      setStreamClientReady(Boolean(getStreamClient()?.userID));
      setReloadSeed(prev => prev + 1);
      return;
    }

    const channel = channelRef.current;

    try {
      setIsLoading(true);
      const state = await channel.query({
        messages: { limit: PAGE_SIZE },
      });

      const streamMessages = (state.messages || []) as MessageResponse[];
      const sortedMessages = [...streamMessages].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
      );

      if (streamMessages.length > 0) {
        setMessages(sortedMessages);
      } else if (!hasHydratedMessagesRef.current) {
        setMessages([]);
      }
      setHasMore(streamMessages.length === PAGE_SIZE);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[Stream] reload failed:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [tripId, isEnabled]);

  const upsertMessageInState = useCallback((message: MessageResponse) => {
    const eventIdempotencyKey =
      (message as MessageResponse & { idempotency_key?: string }).idempotency_key ?? null;
    if (eventIdempotencyKey) {
      pendingIdempotencyKeysRef.current.delete(eventIdempotencyKey);
    }
    setMessages(prev => {
      if (
        eventIdempotencyKey &&
        prev.some(
          existing =>
            (existing as MessageResponse & { idempotency_key?: string }).idempotency_key ===
            eventIdempotencyKey,
        )
      ) {
        return prev;
      }
      const existingIndex = prev.findIndex(existing => existing.id === message.id);
      const next =
        existingIndex >= 0
          ? prev.map(existing => (existing.id === message.id ? message : existing))
          : [...prev, message];
      return capRetainedMessages(sortMessagesWithCanonicalOrdering(next));
    });
  }, []);

  // Subscribe to realtime events
  useEffect(() => {
    const channel = activeChannel;
    if (!channel || !tripId) return;

    // Thread replies (messages with parent_id) are rendered in ThreadView via
    // Stream's getReplies API, not from the main `messages` state. Keeping them
    // out avoids state bloat and unnecessary top-level re-renders.
    const isThreadReply = (msg: MessageResponse): boolean => {
      const parentId =
        msg.parent_id || (msg as MessageResponse & { reply_to_id?: string }).reply_to_id;
      return typeof parentId === 'string' && parentId.length > 0;
    };

    const handleNewMessage = (event: Event) => {
      if (!event.message) return;
      const newMsg = event.message as MessageResponse;
      if (isThreadReply(newMsg)) return;
      trackTimeToFirstMessage('realtime_new');

      upsertMessageInState(event.message as MessageResponse);
    };

    const handleUpdatedMessage = (event: Event) => {
      if (!event.message) return;
      const updated = event.message as MessageResponse;
      if (isThreadReply(updated)) return;
      // Stream emits `message.updated` for edits and pin/unpin mutation confirmations.
      // Route through the same upsert path as realtime/message-send confirmations.
      upsertMessageInState(event.message as MessageResponse);
    };

    const handleDeletedMessage = (event: Event) => {
      if (!event.message) return;
      setMessages(prev => prev.filter(m => m.id !== event.message!.id));
    };

    const handleReaction = (event: Event) => {
      const affectedMessageId = event.message?.id;
      if (!affectedMessageId) return;

      const freshMessages = (channelRef.current?.state.messages ||
        channel.state.messages) as unknown as MessageResponse[];
      const freshMessage = freshMessages.find(message => message.id === affectedMessageId);
      if (!freshMessage) {
        ownReactionTypesByMessageRef.current.delete(affectedMessageId);
        return;
      }

      upsertMessageInState(freshMessage);

      const nextTypes = new Set<string>();
      for (const reaction of freshMessage.own_reactions ?? []) {
        if (reaction?.type) nextTypes.add(reaction.type);
      }
      ownReactionTypesByMessageRef.current.set(affectedMessageId, nextTypes);
    };

    channel.on('message.new', handleNewMessage);
    channel.on('message.updated', handleUpdatedMessage);
    channel.on('message.deleted', handleDeletedMessage);
    channel.on('reaction.new', handleReaction);
    channel.on('reaction.updated', handleReaction);
    channel.on('reaction.deleted', handleReaction);

    return () => {
      channel.off('message.new', handleNewMessage);
      channel.off('message.updated', handleUpdatedMessage);
      channel.off('message.deleted', handleDeletedMessage);
      channel.off('reaction.new', handleReaction);
      channel.off('reaction.updated', handleReaction);
      channel.off('reaction.deleted', handleReaction);
    };
  }, [activeChannel, tripId, trackTimeToFirstMessage, upsertMessageInState]);

  /**
   * Fire-and-forget send: Stream confirms via WebSocket (`message.new`).
   * We intentionally do NOT expose `isCreating` / await the HTTP round-trip here.
   * Otherwise TripChat's `await sendTripMessage` + ChatInput's `isTyping={isCreating}`
   * block the composer until `sendMessage` resolves — if that promise stalls (network,
   * SDK edge case), the send button spins forever and `sendLockRef` never clears.
   */
  const dispatchStreamSend = useCallback(
    (
      content: string,
      mediaType: string | undefined,
      mediaUrl: string | undefined,
      privacyMode: string | undefined,
      messageType: 'text' | 'broadcast' | 'payment' | 'system' | undefined,
      replyToId: string | undefined,
      quotedReference: StreamQuotedReferenceInput | undefined,
      mentionedUserIds: string[] | undefined,
    ) => {
      const channel = channelRef.current;
      if (!channel || !tripId) return;
      const normalizedContent = content.trim();
      const idempotencyKey = `${tripId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
      pendingIdempotencyKeysRef.current.add(idempotencyKey);
      const payloadResult = buildTripStreamMessagePayload({
        content,
        mediaType,
        mediaUrl,
        privacyMode,
        messageType,
        replyToId,
        quotedReference,
        mentionedUserIds,
        idempotencyKey,
      });

      if (!payloadResult.ok) {
        if ('error' in payloadResult && payloadResult.error === 'empty_content') return;
        toast({
          title: 'Message too long',
          description: 'Please keep messages under 4000 characters.',
          variant: 'destructive',
        });
        return;
      }

      void sendMessageWithMentionFallback(channel, payloadResult.payload, () => {
        reportCanaryIncident('mention_notification_failure', {
          reason: 'create_mention_denied_fallback',
        });
      })
        .then(() => {
          messageEvents.sent({
            trip_id: tripId,
            message_type:
              (messageType as 'text' | 'media' | 'broadcast' | 'payment' | 'system') || 'text',
            has_media: Boolean(mediaUrl),
            character_count: payloadResult.normalizedContent.length,
            is_offline_queued: false,
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to send message';
          reportCanaryIncident('send_message_failure', { reason: msg });
          messageEvents.sendFailed(tripId, msg);
          toast({
            title: 'Send Failed',
            description: msg,
            variant: 'destructive',
          });
        });
    },
    [tripId, toast, reportCanaryIncident],
  );

  // Send message — matches useTripChat signature exactly
  const sendMessage = useCallback(
    (
      content: string,
      _authorName: string,
      mediaType?: string,
      mediaUrl?: string,
      _userId?: string,
      privacyMode?: string,
      messageType?: 'text' | 'broadcast' | 'payment' | 'system',
      replyToId?: string,
      quotedReference?: StreamQuotedReferenceInput,
      mentionedUserIds?: string[],
    ) => {
      dispatchStreamSend(
        content,
        mediaType,
        mediaUrl,
        privacyMode,
        messageType,
        replyToId,
        quotedReference,
        mentionedUserIds,
      );
    },
    [dispatchStreamSend],
  );

  /**
   * sendMessageAsync — awaits real channel.sendMessage() and returns the confirmed message.
   * Throws on rejection so callers (TripChat) can restore the draft and show errors.
   */
  const sendMessageAsync = useCallback(
    async (
      content: string,
      _authorName: string,
      mediaType?: string,
      mediaUrl?: string,
      _userId?: string,
      privacyMode?: string,
      messageType?: 'text' | 'broadcast' | 'payment' | 'system',
      replyToId?: string,
      quotedReference?: StreamQuotedReferenceInput,
      mentionedUserIds?: string[],
    ): Promise<MessageResponse | undefined> => {
      const channel = channelRef.current;
      if (!channel || !tripId) return undefined;

      const payloadResult = buildTripStreamMessagePayload({
        content,
        mediaType,
        mediaUrl,
        privacyMode,
        messageType,
        replyToId,
        quotedReference,
        mentionedUserIds,
        idempotencyKey: `${tripId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      });

      if (!payloadResult.ok) {
        if ('error' in payloadResult && payloadResult.error === 'empty_content') return undefined;
        throw new Error('Message too long. Please keep messages under 4000 characters.');
      }

      setIsCreating(true);
      try {
        const response = await sendMessageWithMentionFallback(
          channel,
          payloadResult.payload,
          () => {
            reportCanaryIncident('mention_notification_failure', {
              reason: 'create_mention_denied_fallback',
            });
          },
        );
        const sentMessage = response.message as MessageResponse;

        // Immediately insert or update the sent message in local state
        // so it appears without waiting for the `message.new` WebSocket event.
        if (sentMessage) {
          upsertMessageInState(sentMessage);

          messageEvents.sent({
            trip_id: tripId,
            message_type:
              (messageType as 'text' | 'media' | 'broadcast' | 'payment' | 'system') || 'text',
            has_media: Boolean(mediaUrl),
            character_count: payloadResult.normalizedContent.length,
            is_offline_queued: false,
          });
        }

        return sentMessage;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
        messageEvents.sendFailedAsync(tripId, errorMessage);
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [tripId, reportCanaryIncident, upsertMessageInState],
  );

  // Load more (older messages)
  const toggleReaction = useCallback(
    async (messageId: string, reactionType: string) => {
      if (!channelRef.current) return;
      const channel = channelRef.current;

      try {
        const message = messagesRef.current.find(m => m.id === messageId);
        const trackedReactionTypes =
          ownReactionTypesByMessageRef.current.get(messageId) ?? new Set();

        if (!ownReactionTypesByMessageRef.current.has(messageId)) {
          for (const reaction of message?.own_reactions ?? []) {
            if (reaction?.type) {
              trackedReactionTypes.add(reaction.type);
            }
          }
          ownReactionTypesByMessageRef.current.set(messageId, trackedReactionTypes);
        }

        const hasReacted = trackedReactionTypes.has(reactionType);

        try {
          if (hasReacted) {
            await channel.deleteReaction(messageId, reactionType);
            trackedReactionTypes.delete(reactionType);
          } else {
            await channel.sendReaction(messageId, { type: reactionType });
            trackedReactionTypes.add(reactionType);
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error('[Stream] toggleReaction failed:', err);
          }
          if (isStreamReactionPolicyError(err)) {
            toast({
              title: 'Reaction unavailable',
              description:
                'This reaction is blocked by Stream channel settings or reaction policy. Ask an admin to enable reactions for this channel type.',
              variant: 'destructive',
            });
          } else {
            // Previously swallowed in prod (DEV-only log): a transient/network failure left
            // the user tapping with zero feedback. Surface it so they know to retry.
            toast({
              title: 'Reaction failed',
              description: 'Could not update your reaction. Please try again.',
              variant: 'destructive',
            });
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Stream] toggleReaction prep failed:', err);
        }
      }
    },
    [toast],
  );

  const loadMore = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !hasMore || isLoadingMore || messages.length === 0) return;

    setIsLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      const result = await channel.query({
        messages: { limit: PAGE_SIZE, id_lt: oldestId },
      });

      const rawOlder = (result.messages || []) as MessageResponse[];
      const olderMessages = rawOlder.filter(m => !isDeletedStreamMessage(m));

      if (olderMessages.length > 0) {
        setMessages(prev => capPrependedMessages(olderMessages, prev));
      }
      // Paginate on the raw page length so a page full of soft-deleted messages doesn't
      // prematurely stop "load more".
      setHasMore(rawOlder.length === PAGE_SIZE);
    } catch {
      // Pagination failure is non-fatal
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, messages]);

  const loadAroundMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const channel = channelRef.current;
    if (!channel || !messageId) return false;

    try {
      const result = await channel.query({
        messages: { limit: PAGE_SIZE, id_around: messageId },
      });
      const rawMessages = (result.messages || []) as MessageResponse[];
      const nearbyMessages = rawMessages.filter(m => !isDeletedStreamMessage(m));
      if (nearbyMessages.length === 0) return false;

      setMessages(prev => {
        const byId = new Map<string, MessageResponse>();
        [...prev, ...nearbyMessages].forEach(message => {
          byId.set(message.id, message);
        });
        return capRetainedMessages(sortMessagesWithCanonicalOrdering([...byId.values()]));
      });
      return nearbyMessages.some(message => message.id === messageId);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Stream] loadAroundMessage failed:', error);
      }
      return false;
    }
  }, []);

  const togglePin = useCallback(
    async (messageId: string, shouldPin: boolean) => {
      const streamClient = getStreamClient();
      if (!streamClient) {
        throw new Error('Stream client unavailable');
      }

      const response = await streamClient.partialUpdateMessage(messageId, {
        set: {
          pinned: shouldPin,
        },
      });

      const updatedMessage = (response as { message?: MessageResponse } | null)?.message;
      if (updatedMessage) {
        upsertMessageInState(updatedMessage);
        return;
      }

      const existingMessage = messagesRef.current.find(message => message.id === messageId);
      if (!existingMessage) return;

      upsertMessageInState({
        ...existingMessage,
        pinned: shouldPin,
        pinned_at: shouldPin ? new Date().toISOString() : null,
      } as MessageResponse);
    },
    [upsertMessageInState],
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendMessageAsync,
    isCreating,
    loadMore,
    loadAroundMessage,
    hasMore,
    isLoadingMore,
    toggleReaction,
    togglePin,
    reload,
    activeChannel,
  };
};
