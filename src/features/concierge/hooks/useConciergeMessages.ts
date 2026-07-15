import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useConciergeHistory } from '@/hooks/useConciergeHistory';
import { useConciergeSessionStore } from '@/store/conciergeSessionStore';
import { conciergeCacheService } from '@/services/conciergeCacheService';
import { supabase } from '@/integrations/supabase/client';
import { FAST_RESPONSE_TIMEOUT_MS, EMPTY_SESSION } from '@/features/concierge/utils/chatHelpers';
import { getFeaturePaywallConfig } from '@/components/subscription/featurePaywall';
import type { AiStatus, ChatMessage } from '@/features/concierge/types';

interface Params {
  tripId: string;
  isDemoMode: boolean;
  userId?: string;
  userPlan: 'free' | 'explorer' | 'frequent_chraveler';
}

export function useConciergeMessages({ tripId, isDemoMode, userId, userPlan }: Params) {
  const { user } = useAuth();
  const { isOffline } = useOfflineStatus();
  const storeSessionRaw = useConciergeSessionStore(s => s.sessions[tripId]);
  const storeSession = storeSessionRaw ?? EMPTY_SESSION;
  const setStoreMessages = useConciergeSessionStore(s => s.setMessages);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    storeSession.messages.length > 0 ? (storeSession.messages as ChatMessage[]) : [],
  );
  const messagesRef = useRef<ChatMessage[]>(messages);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>('connected');
  const [historyLoadedFromServer, setHistoryLoadedFromServer] = useState(
    storeSession.historyLoadedFromServer,
  );

  const isMounted = useRef(true);
  const streamAbortRef = useRef<(() => void) | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const hasHydratedRef = useRef(false);

  const buildLimitReachedMessage = useCallback((): ChatMessage => {
    const paywall = getFeaturePaywallConfig('concierge_limit');
    const currentPlan = userPlan === 'explorer' ? 'Explorer' : 'free';
    // Explorer already includes the higher per-trip cap, so once an Explorer
    // user hits the wall the only meaningful step up is the unlimited tier.
    const upgradePitch =
      userPlan === 'explorer'
        ? `Go unlimited with ${paywall.secondaryPlan ?? 'Frequent Chraveler'}.`
        : paywall.featureBenefitCopy;
    return {
      id: `limit-reached-${Date.now()}`,
      type: 'assistant',
      content:
        `You've reached your Concierge limit for this trip on the ${currentPlan} plan. ` +
        `${upgradePitch} Tap **Upgrade** below to see plans — or grab a one-time Trip Pass for just this trip.`,
      timestamp: new Date().toISOString(),
    };
  }, [userPlan]);

  const {
    data: historyMessages,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useConciergeHistory(tripId);

  const mergedHistoryMessages = useMemo(() => {
    const combined = [...(historyMessages ?? [])];
    if (combined.length === 0) return combined;
    const dedupedByFingerprint = new Map<string, ChatMessage>();
    combined.forEach(message => {
      const fingerprint = `${message.type}|${message.content.trim()}|${message.timestamp}`;
      if (!dedupedByFingerprint.has(fingerprint)) dedupedByFingerprint.set(fingerprint, message);
    });
    return Array.from(dedupedByFingerprint.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [historyMessages]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      streamAbortRef.current?.();
      streamAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isHistoryLoading || hasHydratedRef.current) return;

    if (historyError && mergedHistoryMessages.length === 0) {
      const cached = conciergeCacheService.getCachedMessages(tripId, user?.id ?? 'anonymous');
      if (cached.length > 0) {
        setMessages(prev => (prev.length === 0 ? cached : prev));
      }
      hasHydratedRef.current = true;
      return;
    }

    if (mergedHistoryMessages.length > 0) {
      setMessages(prev => (prev.length > 0 ? prev : mergedHistoryMessages));
      setHistoryLoadedFromServer(true);
    }

    hasHydratedRef.current = true;
  }, [isHistoryLoading, historyError, mergedHistoryMessages, tripId, user?.id]);

  // iPad/WKWebView: if history fetch hangs, don't block the composer forever.
  useEffect(() => {
    if (!isHistoryLoading || hasHydratedRef.current) return;
    const timeout = setTimeout(() => {
      if (!isMounted.current || hasHydratedRef.current) return;
      hasHydratedRef.current = true;
    }, 12_000);
    return () => clearTimeout(timeout);
  }, [isHistoryLoading]);

  useEffect(() => {
    if (!isOffline || messages.length > 0) return;
    const cached = conciergeCacheService.getCachedMessages(tripId, user?.id ?? 'anonymous');
    if (cached.length > 0) setMessages(cached);
  }, [isOffline, messages.length, tripId, user?.id]);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length > 0) {
      setStoreMessages(
        tripId,
        messages as import('@/store/conciergeSessionStore').ConciergeSessionMessage[],
      );
    }
  }, [messages, tripId, setStoreMessages]);

  useEffect(() => {
    if (!isTyping) return;
    const watchdog = setTimeout(() => {
      if (!isMounted.current) return;
      setIsTyping(false);
      setAiStatus(prev => (prev === 'thinking' ? 'timeout' : prev));
    }, FAST_RESPONSE_TIMEOUT_MS + 5000);
    return () => clearTimeout(watchdog);
  }, [isTyping]);

  useEffect(() => {
    if (aiStatus === 'connected' || messages.length > 0) return;
    const timeout = setTimeout(() => {
      if (isMounted.current && aiStatus === 'checking') setAiStatus('timeout');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [aiStatus, messages.length]);

  useEffect(() => {
    if (isOffline) setAiStatus('offline');
    else if (aiStatus === 'offline') setAiStatus('connected');
  }, [isOffline, aiStatus]);

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      const historyMatch = messageId.match(/^history-(user|assistant)-([^-]+)/);
      if (historyMatch && user?.id) {
        const [, role, rowId] = historyMatch;
        if (role === 'user') {
          await supabase.from('ai_queries').delete().eq('id', rowId).eq('user_id', user.id);
          const pairedPrefix = `history-assistant-${rowId}`;
          setMessages(prev => prev.filter(m => !m.id.startsWith(pairedPrefix)));
        } else {
          await supabase
            .from('ai_queries')
            .update({ response_text: null })
            .eq('id', rowId)
            .eq('user_id', user.id);
        }
      }
    },
    [user?.id],
  );

  return {
    user,
    isOffline,
    isHistoryLoading,
    messages,
    setMessages,
    messagesRef,
    inputMessage,
    setInputMessage,
    isTyping,
    setIsTyping,
    aiStatus,
    setAiStatus,
    historyLoadedFromServer,
    setHistoryLoadedFromServer,
    isMounted,
    streamAbortRef,
    chatScrollRef,
    buildLimitReachedMessage,
    handleDeleteMessage,
  };
}
