import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, useId } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, ImagePlus } from 'lucide-react';
import { ConciergeSearchModal } from './ai/ConciergeSearchModal';
import { useBasecamp } from '../contexts/BasecampContext';
import { ChatMessages } from '@/features/chat/components/ChatMessages';
import { AiChatInput } from '@/features/chat/components/AiChatInput';
import { useConciergeUsage } from '../hooks/useConciergeUsage';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CTA_BUTTON, CTA_ICON_SIZE } from '@/lib/ctaButtonStyles';
import { getTrustedOverlayOpenHandlers } from '@/lib/bodyPortalOverlay';
import { useSaveToTripPlaces } from '@/hooks/useSaveToTripPlaces';
import { useConciergeReadAloud } from '@/hooks/useConciergeReadAloud';
import { buildSpeechText } from '@/lib/buildSpeechText';
import { sanitizeConciergeContent } from '@/lib/sanitizeConciergeContent';
import { usePendingActions } from '@/hooks/usePendingActions';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALL_ACCEPTED_TYPES,
  MAX_DOCUMENT_SIZE_BYTES as _MAX_DOCUMENT_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES as _MAX_IMAGE_SIZE_BYTES,
  UPLOAD_ENABLED,
} from '@/features/concierge/utils/chatHelpers';
import type { AIConciergeChatProps, AttachmentIntent } from '@/features/concierge/types';
import { useConciergeAttachments } from '@/features/concierge/hooks/useConciergeAttachments';
import { useSmartImportActions } from '@/features/concierge/hooks/useSmartImportActions';
import { useConciergeMessages } from '@/features/concierge/hooks/useConciergeMessages';
import { Skeleton } from '@/components/ui/skeleton';
import { useConciergeVoice } from '@/features/concierge/hooks/useConciergeVoice';
import { useConciergeStreaming } from '@/features/concierge/hooks/useConciergeStreaming';
import { useSmartImportTaste } from '@/features/smart-import/hooks/useSmartImportTaste';
import { useConciergeConversationMode } from '@/features/concierge/hooks/useConciergeConversationMode';
import { RealtimeVoiceButton } from '@/features/concierge/components/RealtimeVoiceButton';
import { VoiceButton } from '@/features/chat/components/VoiceButton';
import { useConversationModePreference } from '@/features/concierge/hooks/useConversationModePreference';
import { useFeatureFlag, useFeatureFlagStatus } from '@/lib/featureFlags';

import type { ChatMessage } from '@/features/concierge/types';
import type { UniversalSearchResult } from '@/services/universalSearchService';

// Lazy: only loads when an upgrade moment actually fires (limit hit / chip tap).
const PlusUpsellModal = lazy(() =>
  import('./PlusUpsellModal').then(m => ({ default: m.PlusUpsellModal })),
);

const SEARCH_FOCUS_EVENT = 'chravel:trip-search-focus';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.ics', '.csv', '.xls', '.xlsx']);

function getFileExtension(file: File): string {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

function isConciergeImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSIONS.has(getFileExtension(file));
}

function isConciergeDocumentFile(file: File): boolean {
  return ALLOWED_DOCUMENT_TYPES.has(file.type) || DOCUMENT_EXTENSIONS.has(getFileExtension(file));
}

function getSearchResultTab(result: UniversalSearchResult): string {
  const metadataTab = result.metadata?.tab;
  if (typeof metadataTab === 'string' && metadataTab.trim()) return metadataTab;
  switch (result.contentType) {
    case 'messages':
      return 'chat';
    case 'calendar':
      return 'calendar';
    case 'task':
      return 'tasks';
    case 'poll':
      return 'polls';
    case 'payment':
      return 'payments';
    case 'place':
    case 'link':
      return 'places';
    case 'media':
    case 'artifact':
      return 'media';
    case 'concierge':
      return 'concierge';
    default:
      return 'chat';
  }
}

function dispatchSearchFocus(result: UniversalSearchResult) {
  const anchor =
    typeof result.metadata?.anchor === 'string'
      ? result.metadata.anchor
      : result.deepLink.split('#')[1];
  if (anchor) window.history.replaceState(window.history.state, '', `#${anchor}`);
  window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: result }));
  const candidateIds = [anchor, `msg-${result.id}`, result.id]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .flatMap(value => [
      value,
      value.replace(/^chat-message-/, ''),
      value.replace(/^concierge-message-/, ''),
    ]);
  const focus = (attempt = 0) => {
    const target = candidateIds
      .map(
        value =>
          document.getElementById(value) ?? document.querySelector(`[data-message-id="${value}"]`),
      )
      .find((el): el is HTMLElement => el instanceof HTMLElement);
    if (!target && attempt < 8) {
      window.setTimeout(() => focus(attempt + 1), 160);
      return;
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('ring-2', 'ring-gold-primary/60');
    window.setTimeout(() => target?.classList.remove('ring-2', 'ring-gold-primary/60'), 1800);
  };
  window.setTimeout(() => focus(), 180);
}

export type { ChatMessage } from '@/features/concierge/types';

export const AIConciergeChat = ({
  tripId,
  basecamp,
  isDemoMode = false,
  isActive = true,
  onTabChange,
}: AIConciergeChatProps) => {
  const { basecamp: globalBasecamp } = useBasecamp();
  const { user: authUser } = useAuth();
  const conciergeQueryClient = useQueryClient();
  const { usage, getUsageStatus, refreshUsage, isLimitedPlan, userPlan, isFreeUser } =
    useConciergeUsage(tripId);
  // Free-tier "taste": 1 Smart Import per trip before the paywall fires.
  const { canUseFreeImport: canUseSmartImportTaste } = useSmartImportTaste(tripId);
  const smartImportBlockedForFree = userPlan === 'free' && !canUseSmartImportTaste;
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const {
    confirmAction,
    rejectAction,
    isConfirming: isConfirmingPendingAction,
    isRejecting: isRejectingPendingAction,
  } = usePendingActions(tripId);
  // Grounding the Concierge in saved preferences is a premium-only capability,
  // enforced authoritatively server-side (lovable-concierge resolves preferences from
  // the DB, gated on isPaidUser). The client no longer sends preferences at all; this
  // flag only drives the "Preferences considered" badge. `isFreeUser` mirrors the
  // server's isPaidUser (same entitlement resolution + super-admin awareness).
  const isPremiumPreferencesUser = !isFreeUser;

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

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!UPLOAD_ENABLED || files.length === 0) return;

      const images: File[] = [];
      const documents: File[] = [];
      const rejected: string[] = [];

      files.forEach(file => {
        if (isConciergeImageFile(file)) {
          if (file.size > _MAX_IMAGE_SIZE_BYTES) rejected.push(file.name);
          else images.push(file);
          return;
        }
        if (isConciergeDocumentFile(file)) {
          if (file.size > _MAX_DOCUMENT_SIZE_BYTES) rejected.push(file.name);
          else documents.push(file);
          return;
        }
        rejected.push(file.name);
      });

      if (images.length > 0) setAttachedImages(prev => [...prev, ...images].slice(0, 4));
      if (documents.length > 0) setAttachedDocuments(prev => [...prev, ...documents].slice(0, 4));
      if (rejected.length > 0) {
        toast.error('Some files could not be attached', {
          description: rejected.slice(0, 3).join(', '),
        });
      }
      if (images.length > 4 || documents.length > 4) {
        toast.info('Attachment limit is 4 images and 4 files per Concierge message.');
      }
    },
    [setAttachedDocuments, setAttachedImages],
  );

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

  const { convoVoiceState, handleConvoToggle, stopDictation } = useConciergeVoice({
    inputMessage,
    setInputMessage,
  });

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
  const uploadInputId = useId();
  const handleSendMessageRef = useRef<(messageOverride?: string) => Promise<void>>(async () =>
    Promise.resolve(),
  );
  // The chat-window card — the realtime voice overlay confines itself to this element
  // instead of taking over the whole viewport.
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages or typing indicator
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

    if (messages.length > 0 || isTyping) {
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
    isLimitReached: usage?.isLimitReached ?? false,
    refreshUsage,
    buildLimitReachedMessage,
    basecamp,
    globalBasecamp,
    attachedImages,
    attachedDocuments,
    attachmentIntent,
    clearAttachments,
    queryClient: conciergeQueryClient,
  });

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // ── Hands-free conversation mode ─────────────────────────────────────
  const conversationModeFlag = useFeatureFlag('concierge_conversation_mode', true);
  const { enabled: conversationModeUserPref } = useConversationModePreference();
  const conversationModeEffective = conversationModeFlag && conversationModeUserPref && !isDemoMode;
  // Experimental bidirectional realtime voice — NOT the App Store launch path.
  // Default OFF; only mounts when feature_flags.concierge_realtime_voice is re-enabled
  // for internal/experimental testing. Launch UX: waveform → text dictation.
  const { enabled: realtimeVoiceFlagEnabled, isPending: realtimeVoiceFlagPending } =
    useFeatureFlagStatus('concierge_realtime_voice', false);
  const experimentalRealtimeVoiceEnabled = realtimeVoiceFlagEnabled && !isDemoMode;

  const buildSpeechForMessage = useCallback((msg: ChatMessage) => {
    if (msg.type !== 'assistant' || !msg.content) return '';
    const clean = sanitizeConciergeContent(msg.content);
    if (!clean) return '';
    return buildSpeechText({
      displayText: clean,
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
  }, []);

  const conversation = useConciergeConversationMode({
    enabled: conversationModeEffective,
    messages,
    isTyping,
    handleSendMessage,
    ttsPlay: ttsPlayRaw,
    ttsStop,
    ttsPlaybackState,
    buildSpeechText: buildSpeechForMessage,
    onError: msg => toast.error(msg),
    onCancelStream: () => {
      try {
        streamAbortRef.current?.();
      } catch {
        /* ignore */
      }
      streamAbortRef.current = null;
      setIsTyping(false);
    },
  });

  // Only tear down Search / conversation when the Concierge tab actually leaves.
  // Do not depend on searchOpen — that would re-run on open and fight the modal.
  useEffect(() => {
    if (isActive) return;
    if (conversation.active) conversation.cancel();
    setSearchOpen(false);
  }, [conversation.active, conversation.cancel, isActive]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col overflow-hidden flex-1 min-h-0 min-w-0 h-full">
      <div
        ref={chatWindowRef}
        className="relative rounded-2xl border border-white/10 bg-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden flex flex-col flex-1"
      >
        {/* Header — single-row trip controls */}
        <div className="relative z-20 border-b border-white/10 bg-black/30 px-3 py-2 flex-shrink-0">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
            <button
              type="button"
              {...getTrustedOverlayOpenHandlers(() => setSearchOpen(true))}
              className={`${CTA_BUTTON} relative z-30 pointer-events-auto`}
              aria-label="Search trip"
              title="Search trip"
              data-testid="header-search-btn"
            >
              <Search size={CTA_ICON_SIZE} className="text-white pointer-events-none" />
            </button>
            <h3
              className="min-w-0 truncate text-center text-base font-semibold leading-tight text-white sm:text-lg"
              data-testid="ai-concierge-header"
            >
              Concierge Chravel Agent
            </h3>
            {/*
              Upload stays in-DOM (transparent file input), not a body-portal overlay —
              no pointerdown→backdrop dismiss race. Keep the real <input> as the tap
              target so iOS WKWebView does not ignore synthetic .click().
            */}
            <label
              htmlFor={uploadInputId}
              data-testid="header-upload-btn"
              className={`${CTA_BUTTON} relative z-30 cursor-pointer overflow-hidden pointer-events-auto`}
              aria-label="Attach files to Concierge"
              title="Attach files to Concierge"
            >
              <ImagePlus size={CTA_ICON_SIZE} className="text-white pointer-events-none" />
              <input
                id={uploadInputId}
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/calendar,.ics,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Attach files to Concierge"
                onChange={e => {
                  handleFilesSelected(Array.from(e.target.files || []));
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* Search Modal */}
        <ConciergeSearchModal
          open={searchOpen}
          onOpenChange={setSearchOpen}
          tripId={tripId}
          onNavigate={result => {
            const tab = getSearchResultTab(result);
            if (tab === 'concierge' || tab === 'ai-chat') {
              dispatchSearchFocus(result);
            } else if (onTabChange) {
              onTabChange(tab);
              window.setTimeout(() => dispatchSearchFocus(result), 120);
            }
          }}
        />

        {/* History loading skeleton — prevents flash of empty → populated */}
        {isHistoryLoading && messages.length === 0 && (
          <div className="flex flex-col gap-3 p-4 flex-shrink-0">
            <Skeleton className="h-8 rounded-xl w-3/4" />
            <Skeleton className="h-8 rounded-xl w-1/2 self-end" />
            <Skeleton className="h-8 rounded-xl w-2/3" />
          </div>
        )}

        {/* Empty State - Compact for Mobile */}
        {messages.length === 0 && !isHistoryLoading && (
          <div className="text-center py-6 px-4 flex-shrink-0">
            <div className="text-sm text-gray-300 space-y-1 max-w-md mx-auto">
              <p className="text-xs sm:text-sm mb-1.5">Try asking your group&rsquo;s concierge:</p>
              <div className="text-xs text-gray-400 space-y-0.5 leading-snug">
                <p>&bull; &ldquo;Find 5 great hotels near our base camp and show me cards&rdquo;</p>
                <p>
                  &bull; &ldquo;Create a poll: Saturday night plans with 4 options near us&rdquo;
                </p>
                <p>&bull; &ldquo;Send an urgent broadcast: meet at the lobby at 7pm&rdquo;</p>
                <p>
                  &bull; &ldquo;Split last night&rsquo;s dinner $240 four ways and log it&rdquo;
                </p>
                <p>&bull; &ldquo;What&rsquo;s on our calendar for the rest of the trip?&rdquo;</p>
              </div>
              <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 rounded px-2.5 py-1 inline-block">
                Group-aware — knows your trip, your members, and writes back to shared state.
              </div>
              {isPremiumPreferencesUser && (
                <div className="mt-2">
                  <span className="inline-flex px-2.5 py-1 bg-gold-primary/10 text-gold-primary text-xs font-medium rounded-full border border-gold-primary/20">
                    ✦ Preferences considered · Premium
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div
          ref={chatScrollRef}
          className="relative z-0 flex-1 overflow-y-auto overflow-x-hidden p-4 chat-scroll-container native-scroll min-h-0 min-w-0"
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
          {messages.length > 0 && (
            <ChatMessages
              messages={messages}
              isTyping={isTyping}
              showMapWidgets={true}
              onDeleteMessage={handleDeleteMessage}
              onTabChange={onTabChange}
              tripId={tripId}
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

        {/* Input area — sticky bottom with inline voice banner above input */}
        {/*
          Composer is a flex sibling of the scroll rail (not absolutely positioned over it).
          Keep z-20 + isolate so long markdown / sticky widgets cannot steal composer hits.
        */}
        <div
          className="chat-composer relative z-20 isolate bg-black/30 px-3 pt-2 flex-shrink-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
          data-testid="concierge-composer-rail"
        >
          {/* Usage meter — only for plans with a finite per-trip ask limit */}
          {!isDemoMode && usage && usage.limit !== null && (
            <div className="mb-1.5 flex items-center justify-end gap-2">
              {usage.isLimitReached && (
                <button
                  type="button"
                  onClick={() => setShowUpsellModal(true)}
                  data-testid="concierge-limit-upgrade-cta"
                  className="text-[11px] font-medium text-primary-foreground bg-gradient-to-r from-gold-primary to-gold-mid rounded-full px-3 py-1 active:scale-95 transition-transform"
                >
                  Upgrade — get more asks
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowUpsellModal(true)}
                data-testid="concierge-usage-chip"
                aria-label="Concierge usage — tap to see upgrade options"
                className="flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 active:scale-95 transition-transform"
              >
                <span className={`text-[11px] leading-none ${getUsageStatus().color}`}>
                  {usage.remaining}/{usage.limit} {userPlan === 'free' ? 'free asks' : 'asks'}
                </span>
              </button>
            </div>
          )}
          {UPLOAD_ENABLED &&
            (attachedImages.length > 0 || attachedDocuments.length > 0) &&
            inputMessage.trim().length === 0 && (
              <div className="mb-2">
                <label className="block text-[11px] text-gray-400 mb-1">Attachment intent</label>
                <select
                  value={attachmentIntent}
                  onChange={e => {
                    const next = e.target.value as AttachmentIntent;
                    if (next === 'smart_import' && smartImportBlockedForFree) {
                      toast.error(
                        "You've used your free Smart Import for this trip. Explorer includes unlimited Smart Import.",
                        {
                          action: {
                            label: 'Upgrade',
                            onClick: () => setShowUpsellModal(true),
                          },
                        },
                      );
                      return;
                    }
                    setAttachmentIntent(next);
                  }}
                  className="w-full h-11 rounded-xl bg-zinc-900/80 border border-white/10 px-3 text-sm text-white"
                  aria-label="Attachment intent"
                >
                  <option value="smart_import" disabled={smartImportBlockedForFree}>
                    Extract events (Smart Import)
                    {userPlan === 'free'
                      ? canUseSmartImportTaste
                        ? ' — 1 free'
                        : ' — Explorer+'
                      : ''}
                  </option>
                  <option value="summarize">Summarize file/image</option>
                  <option value="qa">Q&A on this file/image</option>
                </select>
              </div>
            )}
          {/* Waveform left control: App Store path = text dictation via VoiceButton.
              Experimental realtime voice only mounts when concierge_realtime_voice is on. */}
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
              UPLOAD_ENABLED ? (files: File[]) => handleFilesSelected(files) : undefined
            }
            onRemoveImage={
              UPLOAD_ENABLED
                ? idx => setAttachedImages(prev => prev.filter((_, i) => i !== idx))
                : undefined
            }
            attachedDocuments={UPLOAD_ENABLED ? attachedDocuments : []}
            onDocumentAttach={
              UPLOAD_ENABLED ? (files: File[]) => handleFilesSelected(files) : undefined
            }
            onRejectedFiles={(files: File[]) =>
              toast.error('Some files could not be attached', {
                description: files
                  .slice(0, 3)
                  .map(file => file.name)
                  .join(', '),
              })
            }
            onRemoveDocument={
              UPLOAD_ENABLED
                ? idx => setAttachedDocuments(prev => prev.filter((_, i) => i !== idx))
                : undefined
            }
            acceptedFileTypes={ALL_ACCEPTED_TYPES}
            convoVoiceState={convoVoiceState}
            isVoiceEligible={true}
            leftAccessory={
              realtimeVoiceFlagPending ? undefined : experimentalRealtimeVoiceEnabled ? (
                // Experimental only — not App Store default. Kept for future re-enable.
                <RealtimeVoiceButton
                  tripId={tripId}
                  disabled={usage?.isLimitReached ?? false}
                  containerRef={chatWindowRef}
                  onSessionStart={() => {
                    stopDictation();
                    if (conversation.active) conversation.toggle();
                  }}
                />
              ) : (
                // App Store launch path: waveform triggers Web Speech dictation.
                <VoiceButton
                  voiceState={convoVoiceState}
                  isEligible={true}
                  onToggle={handleConvoToggle}
                />
              )
            }
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

      {/* Upgrade surface — portaled to body so z-index/fixed positioning escapes
          transformed tab containers. PlusUpsellModal also hosts the Trip Pass option. */}
      {showUpsellModal &&
        createPortal(
          <Suspense fallback={null}>
            <PlusUpsellModal isOpen={showUpsellModal} onClose={() => setShowUpsellModal(false)} />
          </Suspense>,
          document.body,
        )}
    </div>
  );
};
