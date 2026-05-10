import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, ImagePlus, Sparkles, PhoneOff } from 'lucide-react';
import { ConciergeSearchModal } from './ai/ConciergeSearchModal';
import { useBasecamp } from '../contexts/BasecampContext';
import { ChatMessages } from '@/features/chat/components/ChatMessages';
import { AiChatInput } from '@/features/chat/components/AiChatInput';
import { useConciergeUsage } from '../hooks/useConciergeUsage';
import { useAuth } from '@/hooks/useAuth';
import { useAIConciergePreferences } from '../hooks/useAIConciergePreferences';
import { toast } from 'sonner';
import { VoiceLiveInline } from '@/features/chat/components/VoiceLiveInline';
import { CTA_BUTTON, CTA_ICON_SIZE } from '@/lib/ctaButtonStyles';
import { useSaveToTripPlaces } from '@/hooks/useSaveToTripPlaces';
import { useConciergeReadAloud } from '@/hooks/useConciergeReadAloud';
import { buildSpeechText } from '@/lib/buildSpeechText';
import { sanitizeConciergeContent } from '@/lib/sanitizeConciergeContent';
import { usePendingActions } from '@/hooks/usePendingActions';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES as _ALLOWED_IMAGE_TYPES,
  ALL_ACCEPTED_TYPES,
  DUPLEX_VOICE_ENABLED,
  MAX_DOCUMENT_SIZE_BYTES as _MAX_DOCUMENT_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES as _MAX_IMAGE_SIZE_BYTES,
  UPLOAD_ENABLED,
} from '@/features/concierge/utils/chatHelpers';
import type { AIConciergeChatProps, AttachmentIntent } from '@/features/concierge/types';
import { useConciergeAttachments } from '@/features/concierge/hooks/useConciergeAttachments';
import { useSmartImportActions } from '@/features/concierge/hooks/useSmartImportActions';
import { useConciergeMessages } from '@/features/concierge/hooks/useConciergeMessages';
import { useConciergeVoice } from '@/features/concierge/hooks/useConciergeVoice';
import { useConciergeStreaming } from '@/features/concierge/hooks/useConciergeStreaming';

export type { ChatMessage } from '@/features/concierge/types';

export const AIConciergeChat = ({
  tripId,
  basecamp,
  preferences,
  isDemoMode = false,
  onTabChange,
}: AIConciergeChatProps) => {
  const { basecamp: globalBasecamp } = useBasecamp();
  const { user: authUser } = useAuth();
  const conciergeQueryClient = useQueryClient();
  const {
    usage: _usage,
    incrementUsageOnSuccess,
    isLimitedPlan,
    userPlan,
  } = useConciergeUsage(tripId);
  const {
    confirmAction,
    rejectAction,
    isConfirming: isConfirmingPendingAction,
    isRejecting: isRejectingPendingAction,
  } = usePendingActions(tripId);
  const loadedPreferences = useAIConciergePreferences();
  const effectivePreferences = preferences ?? loadedPreferences;

  const handleNavigateToPlaces = useCallback(() => {
    if (onTabChange) onTabChange('places');
  }, [onTabChange]);

  const { savePlace, saveFlight, saveHotel, isUrlSaved, isSaving } = useSaveToTripPlaces({
    tripId,
    userId: authUser?.id ?? 'anonymous',
    isDemoMode,
    onNavigateToPlaces: handleNavigateToPlaces,
  });

  // ── Google TTS ──────────────────────────────────────────────────────
  const {
    playbackState: ttsPlaybackState,
    playingMessageId: ttsPlayingMessageId,
    errorMessage: ttsError,
    play: ttsPlayRaw,
    stop: ttsStop,
  } = useConciergeReadAloud({ tripId });

  const {
    messages,
    setMessages,
    messagesRef,
    inputMessage,
    setInputMessage,
    isTyping,
    setIsTyping,
    setAiStatus,
    historyLoadedFromServer,
    isMounted,
    streamAbortRef,
    chatScrollRef,
    isHistoryLoading,
    isOffline,
    user,
    buildLimitReachedMessage,
    handleDeleteMessage,
  } = useConciergeMessages({
    tripId,
    isDemoMode,
    userId: authUser?.id,
    userPlan,
  });

  const {
    attachedImages,
    setAttachedImages,
    attachedDocuments,
    setAttachedDocuments,
    attachmentIntent,
    setAttachmentIntent,
    fileInputRef,
    clearAttachments,
  } = useConciergeAttachments();

  const {
    smartImportStates,
    bulkDeleteStates,
    handleSmartImportConfirm,
    handleSmartImportDismiss,
    handleBulkDeleteConfirm,
    handleBulkDeleteDismiss,
  } = useSmartImportActions({
    tripId,
    userId: user?.id,
    setMessages,
    queryClient: conciergeQueryClient,
  });

  const {
    convoVoiceState,
    handleConvoToggle,
    handleLiveToggle,
    handleEndLiveSession,
    isLiveSessionActive,
    liveTogglePending,
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
  } = useConciergeVoice({
    tripId,
    userId: user?.id,
    isDemoMode,
    isLimitedPlan,
    incrementUsageOnSuccess,
    setMessages,
    setInputMessage,
    buildLimitReachedMessage,
  });

  const showLiveOverlay = isLiveSessionActive || liveTogglePending;

  const handleTTSPlay = useCallback(
    (messageId: string) => {
      const msg = messagesRef.current.find(m => m.id === messageId);
      if (!msg || msg.type !== 'assistant' || !msg.content) return;

      const cleanContent = sanitizeConciergeContent(msg.content);
      if (!cleanContent) return;

      const speechText = buildSpeechText({
        displayText: cleanContent,
        hotels: msg.functionCallHotels,
        places: msg.functionCallPlaces,
        flights: msg.functionCallFlights?.map(f => ({
          origin: f.origin,
          destination: f.destination,
          airline: f.airline,
          price: f.price,
          stops: f.stops,
          durationMinutes: f.durationMinutes,
        })),
      });

      if (!speechText) {
        toast.error('Nothing to speak');
        return;
      }

      void ttsPlayRaw(messageId, speechText);
    },
    [messagesRef, ttsPlayRaw],
  );

  // Show toast on TTS errors
  useEffect(() => {
    if (ttsError && ttsPlaybackState === 'error') {
      toast.error('Voice playback failed', { description: ttsError });
    }
  }, [ttsError, ttsPlaybackState]);

  const [searchOpen, setSearchOpen] = useState(false);
  const handleSendMessageRef = useRef<(messageOverride?: string) => Promise<void>>(async () =>
    Promise.resolve(),
  );

  // Auto-scroll to bottom when new messages, typing indicator, or streaming voice
  // Uses RAF batching + bottom-proximity stickiness to prevent iOS vibration bug
  useEffect(() => {
    let rafId: number | null = null;
    let lastScrollTime = 0;
    const SCROLL_THROTTLE_MS = 80; // Cadence guard to reduce scroll churn on iOS

    const scrollToBottom = () => {
      if (rafId !== null) return; // Already scheduled

      const now = Date.now();
      if (now - lastScrollTime < SCROLL_THROTTLE_MS) return; // Throttle rapid updates

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = chatScrollRef.current;
        if (!container) return;

        // Bottom-proximity stickiness: only scroll if user is near bottom
        // This prevents jarring scroll yanks when user intentionally scrolled up
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        const isNearBottom = distanceFromBottom < 96;

        if (!isNearBottom) return; // User scrolled up intentionally, don't force scroll

        // Redundant scroll-write suppression: skip if already at target
        const targetScrollTop = container.scrollHeight - container.clientHeight;
        if (Math.abs(container.scrollTop - targetScrollTop) <= 2) return;

        container.scrollTop = container.scrollHeight;
        lastScrollTime = Date.now();
      });
    };

    if (messages.length > 0 || isTyping || streamingVoiceMessage || streamingUserMessage) {
      scrollToBottom();
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    chatScrollRef,
    messages.length,
    isTyping,
    // messages removed - redundant with messages.length, was causing double-firing and scroll jitter
    streamingVoiceMessage,
    streamingUserMessage,
  ]);

  const { handleSendMessage } = useConciergeStreaming({
    tripId,
    isDemoMode,
    userId: user?.id,
    isOffline,
    isLimitedPlan,
    inputMessage,
    setInputMessage,
    isTyping,
    messages,
    setMessages,
    messagesRef,
    isMounted,
    streamAbortRef,
    setIsTyping,
    setAiStatus,
    incrementUsageOnSuccess,
    buildLimitReachedMessage,
    basecamp,
    globalBasecamp,
    effectivePreferences,
    attachedImages,
    attachedDocuments,
    attachmentIntent,
    clearAttachments,
    queryClient: conciergeQueryClient,
  });

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="rounded-2xl border border-white/10 bg-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden flex flex-col flex-1">
        {/* Header — title row + controls row */}
        <div className="border-b border-white/10 bg-black/30 px-3 py-2 flex-shrink-0">
          {/* Row 1: Title */}
          <h3
            className="text-lg font-semibold text-white text-center truncate leading-tight"
            data-testid="ai-concierge-header"
          >
            Concierge AI | Chravel Agent
          </h3>
          {/* Row 2: Search | Live | Upload — evenly spaced */}
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={CTA_BUTTON}
              aria-label="Search concierge"
            >
              <Search size={CTA_ICON_SIZE} className="text-white" />
            </button>
            {DUPLEX_VOICE_ENABLED && (
              <button
                type="button"
                onClick={handleLiveToggle}
                className={`relative min-h-[44px] min-w-[44px] h-8 px-3 rounded-full flex items-center justify-center gap-1 transition-all duration-200 select-none touch-manipulation cta-gold-ring ${
                  showLiveOverlay
                    ? 'bg-gradient-to-br from-[#533517] to-[#c49746] text-white shadow-md shadow-[#c49746]/25 border-transparent'
                    : 'bg-gray-800/80 text-white hover:bg-gray-700/80'
                }`}
                aria-label={
                  showLiveOverlay ? 'Stop live voice session' : 'Start live voice session'
                }
                role="switch"
                aria-checked={showLiveOverlay}
              >
                {showLiveOverlay && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#c49746]/30 to-[#feeaa5]/20 blur-sm"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <Sparkles size={14} aria-hidden="true" />
                  <span className="text-xs font-medium leading-none">Live</span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="header-upload-btn"
              className={CTA_BUTTON}
              aria-label="Attach images"
              title="Attach images"
            >
              <ImagePlus size={CTA_ICON_SIZE} className="text-white" />
            </button>
          </div>
        </div>

        {/* Search Modal */}
        <ConciergeSearchModal
          open={searchOpen}
          onOpenChange={setSearchOpen}
          tripId={tripId}
          onNavigate={(tab, id) => {
            if (tab === 'concierge' || tab === 'ai-chat') {
              const el = document.getElementById(`msg-${id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (onTabChange) {
              onTabChange(tab);
            }
          }}
        />

        {/* Hidden file input for header upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/calendar,.ics,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files || []);
            const images = files.filter(f => f.type.startsWith('image/'));
            const docs = files.filter(
              f =>
                ALLOWED_DOCUMENT_TYPES.has(f.type) ||
                f.name.endsWith('.ics') ||
                f.name.endsWith('.csv'),
            );
            if (images.length > 0) setAttachedImages(prev => [...prev, ...images].slice(0, 4));
            if (docs.length > 0) setAttachedDocuments(prev => [...prev, ...docs].slice(0, 4));
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

        {/* History loading skeleton — prevents flash of empty → populated */}
        {isHistoryLoading && messages.length === 0 && (
          <div className="flex flex-col gap-3 p-4 animate-pulse flex-shrink-0">
            <div className="h-8 bg-white/10 rounded-xl w-3/4" />
            <div className="h-8 bg-white/10 rounded-xl w-1/2 self-end" />
            <div className="h-8 bg-white/10 rounded-xl w-2/3" />
          </div>
        )}

        {/* Empty State - Compact for Mobile (hidden during live voice session) */}
        {messages.length === 0 && !isHistoryLoading && !showLiveOverlay && (
          <div className="text-center py-6 px-4 flex-shrink-0">
            <div className="text-sm text-gray-300 space-y-1 max-w-md mx-auto">
              <p className="text-xs sm:text-sm mb-1.5">Try asking:</p>
              <div className="text-xs text-gray-400 space-y-0.5 leading-snug">
                <p>&bull; &ldquo;Find 5 great hotels near our base camp and show me cards&rdquo;</p>
                <p>&bull; &ldquo;What&rsquo;s on our calendar for the rest of the trip?&rdquo;</p>
                <p>
                  &bull; &ldquo;Add a dinner reservation to the calendar for Saturday at 7pm near
                  base camp&rdquo;
                </p>
                <p>
                  &bull; &ldquo;Create a poll: Saturday night plans with 4 options near us&rdquo;
                </p>
              </div>
              <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 rounded px-2.5 py-1 inline-block">
                Chravel Agent can search, display info cards, and add things directly your trip
              </div>
            </div>
          </div>
        )}

        {/* Chat area — shows inline live UI when active, otherwise normal messages */}
        {showLiveOverlay ? (
          <VoiceLiveInline
            liveState={liveState}
            userTranscript={liveUserTranscript}
            assistantTranscript={liveAssistantTranscript}
            diagnostics={liveDiagnostics}
            error={liveError}
            circuitBreakerOpen={liveCircuitBreakerOpen}
            conversationEmpty={liveConversationHistory.length === 0}
            onRetry={() => void startLiveSession()}
            onResetCircuitBreaker={liveResetCircuitBreaker}
          />
        ) : (
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 chat-scroll-container native-scroll min-h-0"
          >
            {/* "Picked up where you left off" divider — shown once when server history hydrates */}
            {historyLoadedFromServer && messages.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-gray-700 whitespace-nowrap">
                  ↩ Picked up where you left off
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            )}
            {/* Merge transient streaming bubbles into the message list so both the
                 user's live STT and the assistant's live TTS are visible in the
                 chat while Gemini Live is active.  Order: persisted messages →
                 user interim bubble (while listening) → assistant streaming bubble
                 (while playing).  handleLiveTurnComplete clears both transient
                 entries and appends the finalised messages, so there is no
                 duplication or flash. */}
            {(messages.length > 0 || !!streamingVoiceMessage || !!streamingUserMessage) && (
              <ChatMessages
                messages={[
                  ...messages,
                  ...(streamingUserMessage ? [streamingUserMessage] : []),
                  ...(streamingVoiceMessage ? [streamingVoiceMessage] : []),
                ]}
                isTyping={isTyping}
                showMapWidgets={true}
                onDeleteMessage={handleDeleteMessage}
                onTabChange={onTabChange}
                onSavePlace={savePlace}
                onSaveFlight={saveFlight}
                onSaveHotel={saveHotel}
                isUrlSaved={isUrlSaved}
                isSaving={isSaving}
                onEditReservation={(prefill: string) => {
                  setInputMessage(prefill);
                }}
                onSmartImportConfirm={handleSmartImportConfirm}
                onSmartImportDismiss={handleSmartImportDismiss}
                onBulkDeleteConfirm={handleBulkDeleteConfirm}
                onBulkDeleteDismiss={handleBulkDeleteDismiss}
                onConfirmPendingAction={confirmAction}
                onRejectPendingAction={rejectAction}
                isConfirmingPendingAction={isConfirmingPendingAction}
                isRejectingPendingAction={isRejectingPendingAction}
                smartImportStates={smartImportStates}
                bulkDeleteStates={bulkDeleteStates}
                ttsPlaybackState={ttsPlaybackState}
                ttsPlayingMessageId={ttsPlayingMessageId}
                onTTSPlay={handleTTSPlay}
                onTTSStop={ttsStop}
              />
            )}
          </div>
        )}

        {/* Input area — sticky bottom with inline voice banner above input */}
        <div
          className="chat-composer z-10 bg-black/30 px-3 pt-2 flex-shrink-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
        >
          {UPLOAD_ENABLED &&
            (attachedImages.length > 0 || attachedDocuments.length > 0) &&
            inputMessage.trim().length === 0 && (
              <div className="mb-2">
                <label className="block text-[11px] text-gray-400 mb-1">Attachment intent</label>
                <select
                  value={attachmentIntent}
                  onChange={e => setAttachmentIntent(e.target.value as AttachmentIntent)}
                  className="w-full h-11 rounded-xl bg-zinc-900/80 border border-white/10 px-3 text-sm text-white"
                  aria-label="Attachment intent"
                >
                  <option value="smart_import">Extract events (Smart Import)</option>
                  <option value="summarize">Summarize file/image</option>
                  <option value="qa">Q&A on this file/image</option>
                </select>
              </div>
            )}
          {/* End session button — aligned above dictation button on same vertical axis */}
          {showLiveOverlay && (
            <div className="mb-2 w-11">
              <button
                type="button"
                onClick={() => void handleEndLiveSession()}
                className="size-11 min-w-[44px] rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-lg shadow-red-900/40 touch-manipulation"
                aria-label="End voice session"
              >
                <PhoneOff size={18} className="text-white" aria-hidden="true" />
              </button>
            </div>
          )}
          <AiChatInput
            inputMessage={inputMessage}
            onInputChange={setInputMessage}
            onSendMessage={() => {
              void handleSendMessage();
            }}
            onKeyPress={handleKeyPress}
            isTyping={isTyping}
            showImageAttach={UPLOAD_ENABLED}
            attachedImages={UPLOAD_ENABLED ? attachedImages : []}
            onImageAttach={
              UPLOAD_ENABLED
                ? (files: File[]) => setAttachedImages(prev => [...prev, ...files].slice(0, 4))
                : undefined
            }
            onRemoveImage={
              UPLOAD_ENABLED
                ? idx => setAttachedImages(prev => prev.filter((_, i) => i !== idx))
                : undefined
            }
            attachedDocuments={UPLOAD_ENABLED ? attachedDocuments : []}
            onDocumentAttach={
              UPLOAD_ENABLED
                ? (files: File[]) => setAttachedDocuments(prev => [...prev, ...files].slice(0, 4))
                : undefined
            }
            onRemoveDocument={
              UPLOAD_ENABLED
                ? idx => setAttachedDocuments(prev => prev.filter((_, i) => i !== idx))
                : undefined
            }
            acceptedFileTypes={ALL_ACCEPTED_TYPES}
            convoVoiceState={convoVoiceState}
            onConvoToggle={handleConvoToggle}
            isVoiceEligible={true}
            onQuickAction={
              UPLOAD_ENABLED && (attachedImages.length > 0 || attachedDocuments.length > 0)
                ? (action: string) => {
                    const actionMessages: Record<string, string> = {
                      add_to_calendar: 'Add this to the trip calendar',
                      save_to_trip: 'Save this to the trip',
                      create_tasks: 'Create tasks from this',
                    };
                    const msg = actionMessages[action] || 'Analyze this';
                    setInputMessage(msg);
                    void handleSendMessage(msg);
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};
