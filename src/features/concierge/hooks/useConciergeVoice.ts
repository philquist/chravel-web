import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useWebSpeechVoice } from '@/hooks/useWebSpeechVoice';
import type { VoiceState } from '@/hooks/useWebSpeechVoice';
import { useLiveKitVoice } from '@/hooks/useLiveKitVoice';
import { useVoiceToolHandler } from '@/hooks/useVoiceToolHandler';
import { supabase } from '@/integrations/supabase/client';
import type { ToolCallResult } from '@/types/voice';
import type { ChatMessage } from '@/features/concierge/types';
import { extractRichMetadata, DUPLEX_VOICE_ENABLED } from '@/features/concierge/utils/chatHelpers';

interface Params {
  tripId: string;
  userId?: string;
  isDemoMode: boolean;
  isLimitedPlan: boolean;
  incrementUsageOnSuccess: () => Promise<{ incremented: boolean }>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  buildLimitReachedMessage: () => ChatMessage;
}

export function useConciergeVoice({
  tripId,
  userId,
  isDemoMode,
  isLimitedPlan,
  incrementUsageOnSuccess,
  setMessages,
  setInputMessage,
  buildLimitReachedMessage,
}: Params) {
  const [streamingVoiceMessage, setStreamingVoiceMessage] = useState<ChatMessage | null>(null);
  const [streamingUserMessage, setStreamingUserMessage] = useState<ChatMessage | null>(null);

  const handleDictationResult = useCallback(
    (text: string) => {
      if (text.trim()) {
        setInputMessage(prev => {
          const separator = prev && !prev.endsWith(' ') ? ' ' : '';
          return prev + separator + text.trim();
        });
      }
    },
    [setInputMessage],
  );

  const { voiceState: dictationState, toggleVoice: toggleDictation } =
    useWebSpeechVoice(handleDictationResult);
  const isDictationActive = dictationState !== 'idle' && dictationState !== 'error';

  const { handleToolCall: _handleToolCall } = useVoiceToolHandler({ tripId, userId: userId ?? '' });

  const handleLiveTurnComplete = useCallback(
    async (
      userText: string,
      assistantText: string,
      toolResults?: ToolCallResult[],
      _turn?: { id: string },
      acknowledgeTurn?: () => void,
    ) => {
      const now = new Date().toISOString();
      const newMessages: ChatMessage[] = [];
      if (userText)
        newMessages.push({
          id: `voice-user-${Date.now()}`,
          type: 'user',
          content: userText,
          timestamp: now,
        });
      if (assistantText) {
        const assistantMsg: ChatMessage = {
          id: `voice-assistant-${Date.now()}`,
          type: 'assistant',
          content: assistantText,
          timestamp: now,
        };
        if (toolResults && toolResults.length > 0) {
          for (const tr of toolResults) {
            if (
              (tr.name === 'searchPlaces' || tr.name === 'getPlaceDetails') &&
              tr.result?.success
            ) {
              const places = tr.result.places ?? (tr.result.place ? [tr.result.place] : []);
              if (Array.isArray(places) && places.length > 0)
                assistantMsg.functionCallPlaces = places as ChatMessage['functionCallPlaces'];
            }
            if (tr.name === 'searchFlights' && tr.result?.success && tr.result.flights)
              assistantMsg.functionCallFlights = tr.result
                .flights as ChatMessage['functionCallFlights'];
            if (
              (tr.name === 'searchWeb' || tr.name === 'searchImages') &&
              tr.result?.success &&
              tr.result.results
            ) {
              assistantMsg.sources = (
                tr.result.results as Array<{ title: string; url: string; snippet: string }>
              ).map(r => ({ title: r.title || '', url: r.url || '', snippet: r.snippet || '' }));
            }
          }
        }
        newMessages.push(assistantMsg);
      }
      if (newMessages.length > 0) setMessages(prev => [...prev, ...newMessages]);
      setStreamingVoiceMessage(null);
      setStreamingUserMessage(null);
      acknowledgeTurn?.();

      if (userText && assistantText && userId) {
        try {
          const voiceAssistantMsg = newMessages.find(m => m.type === 'assistant');
          const richMeta = extractRichMetadata(voiceAssistantMsg);
          const { error } = await supabase.from('ai_queries').insert({
            trip_id: tripId,
            user_id: userId,
            query_text: userText,
            response_text: assistantText,
            created_at: now,
            ...(richMeta ? { metadata: richMeta } : {}),
          } as Record<string, unknown>);
          if (error)
            toast.warning('Voice turn not saved', {
              description: 'Your voice conversation could not be saved to history.',
            });
        } catch {
          toast.warning('Voice turn not saved', {
            description: 'Your voice conversation could not be saved to history.',
          });
        }
      }
    },
    [setMessages, tripId, userId],
  );

  const handleLiveRichCard = useCallback(
    (toolName: string, cardData: Record<string, unknown>) => {
      setMessages(prev => {
        const lastIdx = prev.length - 1;
        if (lastIdx < 0) return prev;
        const last = prev[lastIdx];
        if (last.type !== 'assistant') return prev;
        const updated = [...prev];
        const msg = { ...last };
        if (
          (toolName === 'searchPlaces' || toolName === 'getPlaceDetails') &&
          cardData.places &&
          Array.isArray(cardData.places)
        ) {
          msg.functionCallPlaces = cardData.places as ChatMessage['functionCallPlaces'];
        }
        updated[lastIdx] = msg;
        return updated;
      });
    },
    [setMessages],
  );

  const handleLivePartialTranscript = useCallback(
    ({ role, text }: { role: 'user' | 'assistant'; text: string; isFinal: boolean }) => {
      if (!text) return;
      if (role === 'assistant') {
        setStreamingVoiceMessage({
          id: 'voice-streaming-live',
          type: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
          isStreamingVoice: true,
        });
        return;
      }

      setStreamingUserMessage({
        id: 'voice-user-streaming-live',
        type: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        isStreamingVoice: true,
      });
    },
    [],
  );

  const handleLiveError = useCallback((msg: string) => {
    toast.error('Voice error', { description: msg });
  }, []);

  const {
    state: liveState,
    error: liveError,
    userTranscript: liveUserTranscript,
    assistantTranscript: liveAssistantTranscript,
    conversationHistory: liveConversationHistory,
    diagnostics: liveDiagnostics,
    startSession: startLiveSession,
    endSession: endLiveSession,
    circuitBreakerOpen: liveCircuitBreakerOpen,
    resetCircuitBreaker: liveResetCircuitBreaker,
  } = useLiveKitVoice({
    tripId,
    onTurnComplete: handleLiveTurnComplete,
    onRichCard: handleLiveRichCard,
    onError: handleLiveError,
    onPartialTranscript: handleLivePartialTranscript,
  });

  const convoVoiceState: VoiceState = dictationState;
  const isLiveSessionActive = DUPLEX_VOICE_ENABLED && liveState !== 'idle' && liveState !== 'error';

  const handleEndLiveSession = useCallback(async () => {
    await endLiveSession();
    setStreamingVoiceMessage(null);
    setStreamingUserMessage(null);
  }, [endLiveSession]);

  const handleConvoToggle = useCallback(() => {
    if (isLiveSessionActive) {
      void handleEndLiveSession();
      setInputMessage('');
    }
    toggleDictation();
  }, [isLiveSessionActive, handleEndLiveSession, setInputMessage, toggleDictation]);

  const handleLiveToggle = useCallback(async () => {
    if (!DUPLEX_VOICE_ENABLED) return;
    if (isDictationActive) {
      toggleDictation();
      setInputMessage('');
    }
    if (isLiveSessionActive) {
      await handleEndLiveSession();
      return;
    }
    if (liveState === 'error') await handleEndLiveSession();
    if (isLimitedPlan && !isDemoMode) {
      let incrementResult;
      try {
        incrementResult = await incrementUsageOnSuccess();
      } catch {
        toast.error('Unable to verify Concierge allowance. Please try again.');
        return;
      }
      if (!incrementResult.incremented) {
        setMessages(prev => [...prev, buildLimitReachedMessage()]);
        return;
      }
    }
    await startLiveSession();
  }, [
    isDictationActive,
    toggleDictation,
    setInputMessage,
    isLiveSessionActive,
    handleEndLiveSession,
    liveState,
    isLimitedPlan,
    isDemoMode,
    incrementUsageOnSuccess,
    setMessages,
    buildLimitReachedMessage,
    startLiveSession,
  ]);

  return {
    convoVoiceState,
    handleConvoToggle,
    handleLiveToggle,
    handleEndLiveSession,
    isLiveSessionActive,
    streamingVoiceMessage,
    streamingUserMessage,
    liveState,
    liveUserTranscript,
    liveAssistantTranscript,
    liveError,
    liveConversationHistory,
    liveDiagnostics,
    liveCircuitBreakerOpen,
    liveResetCircuitBreaker,
    startLiveSession,
  };
}
