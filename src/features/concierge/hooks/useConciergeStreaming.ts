import { type QueryClient } from '@tanstack/react-query';
import {
  invokeConciergeStream,
  type ReservationDraft,
  type SmartImportStatus,
  type StreamMetadataEvent,
  type TripCard,
  type StreamSmartImportPreviewEvent,
  type StreamBulkDeletePreviewEvent,
} from '@/services/conciergeGateway';
import type { HotelResult } from '@/features/chat/components/HotelResultCards';
import { supabase } from '@/integrations/supabase/client';
import { useConciergeLanguagePreference } from '@/features/concierge/hooks/useConciergeLanguagePreference';
import { getConciergeInvalidationKeys, isConciergeWriteAction } from '@/lib/conciergeInvalidation';
import { sanitizeConciergeContent } from '@/lib/sanitizeConciergeContent';
import { conciergeCacheService } from '@/services/conciergeCacheService';
import type {
  AttachmentIntent,
  ChatMessage,
  ConciergeAttachment,
} from '@/features/concierge/types';
import {
  FAST_RESPONSE_TIMEOUT_MS,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_SINGLE_MESSAGE_LENGTH,
  UPLOAD_ENABLED,
  _uniqueId,
  extractRichMetadata,
  fileToAttachmentPayload,
  generateFallbackResponse,
  invokeConciergeWithTimeout,
} from '@/features/concierge/utils/chatHelpers';

interface Params {
  tripId: string;
  isDemoMode: boolean;
  userId?: string;
  isOffline: boolean;
  isLimitedPlan: boolean;
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  isTyping: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  isMounted: React.MutableRefObject<boolean>;
  streamAbortRef: React.MutableRefObject<(() => void) | null>;
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>;
  setAiStatus: React.Dispatch<React.SetStateAction<string>>;
  isLimitReached: boolean;
  refreshUsage: () => Promise<unknown>;
  buildLimitReachedMessage: () => ChatMessage;
  basecamp?: { name?: string; address: string };
  globalBasecamp?: { name?: string; address: string };
  attachedImages: File[];
  attachedDocuments: File[];
  attachmentIntent: AttachmentIntent;
  clearAttachments: () => void;
  queryClient: QueryClient;
}

export function useConciergeStreaming(params: Params) {
  const {
    tripId,
    isDemoMode,
    userId,
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
    isLimitReached,
    refreshUsage,
    buildLimitReachedMessage,
    basecamp,
    globalBasecamp,
    attachedImages,
    attachedDocuments,
    attachmentIntent,
    clearAttachments: _clearAttachments,
    queryClient: conciergeQueryClient,
  } = params;

  const { isoCode: replyLanguage } = useConciergeLanguagePreference();

  const handleSendMessage = async (
    messageOverride?: string,
    opts?: { conversationSessionId?: string },
  ) => {
    const typedMessage =
      typeof messageOverride === 'string' ? messageOverride.trim() : inputMessage.trim();
    const selectedImages = UPLOAD_ENABLED ? [...attachedImages] : [];
    const selectedDocuments = UPLOAD_ENABLED ? [...attachedDocuments] : [];
    const hasImageAttachments = selectedImages.length > 0;
    const hasDocumentAttachments = selectedDocuments.length > 0;
    const hasAnyAttachments = hasImageAttachments || hasDocumentAttachments;
    if ((!typedMessage && !hasAnyAttachments) || isTyping) return;

    const attachmentCount = selectedImages.length + selectedDocuments.length;
    const messageToSend =
      typedMessage ||
      (attachmentIntent === 'summarize'
        ? `Please summarize the attached file(s) and highlight key travel details.`
        : attachmentIntent === 'qa'
          ? `Please analyze the attached file(s). I'll ask follow-up questions next.`
          : hasDocumentAttachments
            ? `Please analyze the attached file(s) and extract any travel events, reservations, or itinerary items. Show me a preview before adding to calendar.`
            : `Please analyze the ${selectedImages.length} attached image(s).`);
    const userDisplayContent =
      typedMessage || `Attached ${attachmentCount} file${attachmentCount === 1 ? '' : 's'}`;

    if (isOffline) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'user',
          content: messageToSend,
          timestamp: new Date().toISOString(),
        },
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content:
            "📡 **Offline Mode**\n\nI can't send this request while you're offline. Reconnect and try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
      if (!messageOverride) {
        setInputMessage('');
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: _uniqueId('user'),
      type: 'user',
      content: userDisplayContent,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = messageToSend;

    if (!messageOverride) {
      setInputMessage('');
    }
    if (selectedImages.length > 0 || selectedDocuments.length > 0) {
      _clearAttachments();
    }
    setIsTyping(true);
    setAiStatus('thinking');

    if (isLimitedPlan && !isDemoMode) {
      // Usage is incremented server-side after a successful concierge response.
      // Client-side pre-check avoids showing a user message that will be rejected.
      if (isLimitReached) {
        setMessages(prev => [...prev, buildLimitReachedMessage()]);
        setIsTyping(false);
        return;
      }
    }

    const fallbackContext = {
      tripId,
      title: 'Current Trip',
      location: globalBasecamp?.address || basecamp?.address || 'Unknown location',
      dateRange: new Date().toISOString().split('T')[0],
      itinerary: [],
      calendar: [],
      payments: [],
    };

    const basecampLocation = globalBasecamp
      ? {
          name: globalBasecamp.name || 'Basecamp',
          address: globalBasecamp.address,
        }
      : basecamp
        ? {
            name: basecamp.name || 'Basecamp',
            address: basecamp.address,
          }
        : undefined;

    let streamingStarted = false;

    try {
      let attachments: ConciergeAttachment[] = [];
      if (selectedImages.length > 0) {
        attachments = await Promise.all(selectedImages.map(fileToAttachmentPayload));
      }
      if (selectedDocuments.length > 0) {
        const docAttachments = await Promise.all(selectedDocuments.map(fileToAttachmentPayload));
        attachments = [...attachments, ...docAttachments];
      }

      // Slice the last N prior messages. The current user message is
      // appended separately by the edge function, so N prior + 1 current = N+1
      // messages of context. Cap at MAX_CHAT_HISTORY_MESSAGES to avoid
      // exceeding Gemini's context window with long conversations.
      const chatHistory = messages.slice(-MAX_CHAT_HISTORY_MESSAGES).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content:
          msg.content.length > MAX_SINGLE_MESSAGE_LENGTH
            ? msg.content.substring(0, MAX_SINGLE_MESSAGE_LENGTH) + '...[truncated]'
            : msg.content,
      }));

      const requestBody = {
        message: currentInput,
        tripId,
        ...(replyLanguage ? { replyLanguage } : {}),
        chatHistory,
        attachments,
        isDemoMode,
        config: {
          model: 'gemini-3-flash-preview',
          temperature: 0.55,
          maxTokens: 4096,
        },
        ...(hasAnyAttachments && !typedMessage ? { attachmentIntent } : {}),
        ...(opts?.conversationSessionId
          ? { conversation_session_id: opts.conversationSessionId }
          : {}),
      };

      // === STREAMING PATH ===
      if (!isDemoMode) {
        const streamingMessageId = _uniqueId('stream');
        let receivedAnyChunk = false;
        let accumulatedStreamContent = ''; // accumulates full text so we can cache after onDone
        const streamTimer = { id: undefined as ReturnType<typeof setTimeout> | undefined };

        const triggerStreamTimeout = () => {
          streamAbortRef.current?.();
          streamAbortRef.current = null;
          if (!isMounted.current) return;
          setAiStatus('timeout');
          setIsTyping(false);
          const timeoutContent = `⚠️ **Request timed out**\n\n${generateFallbackResponse(currentInput, fallbackContext, basecampLocation)}`;
          setMessages(prev => {
            const exists = prev.some(m => m.id === streamingMessageId);
            if (exists) {
              return prev.map(m =>
                m.id === streamingMessageId ? { ...m, content: timeoutContent } : m,
              );
            }
            return [
              ...prev,
              {
                id: streamingMessageId,
                type: 'assistant' as const,
                content: timeoutContent,
                timestamp: new Date().toISOString(),
              },
            ];
          });
        };

        const resetStreamWatchdog = () => {
          if (streamTimer.id) clearTimeout(streamTimer.id);
          streamTimer.id = setTimeout(triggerStreamTimeout, FAST_RESPONSE_TIMEOUT_MS);
        };

        const updateStreamMsg = (updater: (msg: ChatMessage) => Partial<ChatMessage>) => {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === streamingMessageId);
            if (idx === -1) return prev;
            const patch = updater(prev[idx]);
            if (Object.keys(patch).length === 0) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...patch };
            return updated;
          });
        };

        const hasRenderableAssistantPayload = (msg?: ChatMessage): boolean =>
          !!(
            msg &&
            (msg.functionCallHotels?.length ||
              msg.functionCallFlights?.length ||
              msg.functionCallPlaces?.length ||
              msg.pendingActions?.length ||
              msg.reservationDrafts?.length ||
              msg.smartImportPreview ||
              msg.bulkDeletePreview ||
              msg.smartImportStatus ||
              (msg.conciergeActions && msg.conciergeActions.length > 0))
          );

        const streamHandle = invokeConciergeStream(
          requestBody,
          {
            onActivity: () => {
              resetStreamWatchdog();
            },
            onChunk: (text: string) => {
              if (!isMounted.current) return;
              accumulatedStreamContent += text; // always accumulate for caching
              // Sanitize accumulated content so users never see leaked JSON mid-stream
              const displayContent = sanitizeConciergeContent(accumulatedStreamContent);
              if (!receivedAnyChunk) {
                receivedAnyChunk = true;
                setIsTyping(false);
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === streamingMessageId);
                  if (idx !== -1) {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], content: displayContent };
                    return updated;
                  }
                  return [
                    ...prev,
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: displayContent,
                      timestamp: new Date().toISOString(),
                    },
                  ];
                });
                return;
              }
              updateStreamMsg(() => ({ content: displayContent }));
            },
            onFunctionCall: (name: string, result: Record<string, unknown>) => {
              if (!isMounted.current) return;
              // Tool execution means the stream is alive — prevent timeout.
              receivedAnyChunk = true;
              // Ensure the streaming message exists so place cards render immediately,
              // even before the first text chunk arrives (tools run before LLM response).
              const ensureAndPatch = (patch: Partial<ChatMessage>) => {
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === streamingMessageId);
                  if (idx !== -1) {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], ...patch };
                    return updated;
                  }
                  // Create placeholder message so place cards appear immediately
                  return [
                    ...prev,
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: '',
                      timestamp: new Date().toISOString(),
                      ...patch,
                    },
                  ];
                });
              };

              if (name === 'searchPlaces' && result.places && Array.isArray(result.places)) {
                ensureAndPatch({
                  functionCallPlaces: result.places as ChatMessage['functionCallPlaces'],
                });
              }
              if (name === 'searchFlights' && result.success) {
                const flightResult = {
                  origin: result.origin as string,
                  destination: result.destination as string,
                  departureDate: result.departureDate as string,
                  returnDate: result.returnDate as string | undefined,
                  passengers: (result.passengers as number) || 1,
                  deeplink: result.deeplink as string,
                  provider: result.provider as string | null,
                  price:
                    (result.price as {
                      amount?: number | null;
                      currency?: string | null;
                      display?: string | null;
                    } | null) ?? null,
                  airline: result.airline as string | null,
                  flightNumber: result.flightNumber as string | null,
                  stops: result.stops as number | null,
                  durationMinutes: result.durationMinutes as number | null,
                  departTime: result.departTime as string | null,
                  arriveTime: result.arriveTime as string | null,
                  refundable: result.refundable as boolean | null,
                };
                ensureAndPatch({
                  functionCallFlights: [flightResult],
                });
              }
              // searchHotels function call → hotel cards
              if (name === 'searchHotels' && result.hotels && Array.isArray(result.hotels)) {
                ensureAndPatch({
                  functionCallHotels: result.hotels as HotelResult[],
                });
              }
              // Single hotel detail from getHotelDetails
              if (name === 'getHotelDetails' && result.success && result.title) {
                const hotelResult: HotelResult = {
                  id: result.id as string | null,
                  provider: result.provider as string | null,
                  title: result.title as string,
                  subtitle: result.subtitle as string | null,
                  badges: result.badges as string[] | undefined,
                  price: result.price as HotelResult['price'],
                  dates: result.dates as HotelResult['dates'],
                  location: result.location as HotelResult['location'],
                  details: result.details as HotelResult['details'],
                  deep_links: result.deep_links as HotelResult['deep_links'],
                };
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === streamingMessageId);
                  if (idx !== -1) {
                    const existing = prev[idx].functionCallHotels || [];
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      functionCallHotels: [...existing, hotelResult],
                    };
                    return updated;
                  }
                  return [
                    ...prev,
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: '',
                      timestamp: new Date().toISOString(),
                      functionCallHotels: [hotelResult],
                    },
                  ];
                });
              }
              if (name === 'getPlaceDetails' && result.success) {
                const detailPlace = {
                  placeId: result.placeId as string,
                  name: result.name as string,
                  address: result.address as string,
                  rating: result.rating as number | null,
                  userRatingCount: result.userRatingCount as number | null,
                  priceLevel: result.priceLevel as string | null,
                  mapsUrl: result.mapsUrl as string | null,
                  previewPhotoUrl: (result.photoUrls as string[])?.[0] || null,
                  photoUrls: result.photoUrls as string[],
                };
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === streamingMessageId);
                  if (idx !== -1) {
                    const existing = prev[idx].functionCallPlaces || [];
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      functionCallPlaces: [...existing, detailPlace],
                    };
                    return updated;
                  }
                  // Create placeholder with this first place detail
                  return [
                    ...prev,
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: '',
                      timestamp: new Date().toISOString(),
                      functionCallPlaces: [detailPlace],
                    },
                  ];
                });
              }

              // Handle concierge write actions (createPoll, createTask, savePlace, etc.)
              if (isConciergeWriteAction(name) && result.actionType) {
                if (result.pending && result.pendingActionId) {
                  const pendingAction = {
                    id: result.pendingActionId as string,
                    toolName: name,
                    actionType: result.actionType as string,
                    message: (result.message as string) || '',
                    title: (result.title as string) || (result.question as string) || undefined,
                    detail: (result.detail as string) || null,
                  };
                  setMessages(prev => {
                    const idx = prev.findIndex(m => m.id === streamingMessageId);
                    if (idx !== -1) {
                      const updated = [...prev];
                      const existing = updated[idx].pendingActions || [];
                      updated[idx] = {
                        ...updated[idx],
                        pendingActions: [...existing, pendingAction],
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        id: streamingMessageId,
                        type: 'assistant' as const,
                        content: '',
                        timestamp: new Date().toISOString(),
                        pendingActions: [pendingAction],
                      },
                    ];
                  });

                  // CRITICAL: Invalidate pending actions query so auto-confirm fires.
                  // Without this, usePendingActions never sees the new row and the
                  // task/poll/calendar event stays parked in trip_pending_actions forever.
                  conciergeQueryClient.invalidateQueries({
                    queryKey: ['pendingActions', tripId],
                  });
                  return;
                }

                // Extract entity name from nested result objects
                const entityName =
                  (result.entityName as string) ||
                  ((result.poll as Record<string, unknown>)?.question as string) ||
                  ((result.poll as Record<string, unknown>)?.title as string) ||
                  ((result.task as Record<string, unknown>)?.title as string) ||
                  ((result.task as Record<string, unknown>)?.name as string) ||
                  ((result.event as Record<string, unknown>)?.title as string) ||
                  ((result.event as Record<string, unknown>)?.name as string) ||
                  ((result.link as Record<string, unknown>)?.name as string) ||
                  ((result.link as Record<string, unknown>)?.title as string) ||
                  ((result.agendaItem as Record<string, unknown>)?.title as string) ||
                  ((result.place as Record<string, unknown>)?.name as string) ||
                  (result.name as string) ||
                  (result.title as string) ||
                  undefined;

                // Detect duplicate/skipped status from tool result
                const status = result.duplicate
                  ? ('duplicate' as const)
                  : result.skipped
                    ? ('skipped' as const)
                    : result.success
                      ? ('success' as const)
                      : ('failure' as const);

                const actionResult = {
                  actionType: result.actionType as string,
                  success: !!result.success,
                  message: (result.message as string) || (result.error as string) || '',
                  entityId:
                    ((result.poll as Record<string, unknown>)?.id as string) ||
                    ((result.task as Record<string, unknown>)?.id as string) ||
                    ((result.event as Record<string, unknown>)?.id as string) ||
                    ((result.link as Record<string, unknown>)?.id as string) ||
                    ((result.agendaItem as Record<string, unknown>)?.id as string) ||
                    undefined,
                  entityName,
                  scope: result.scope as string | undefined,
                  status,
                };
                setMessages(prev => {
                  const idx = prev.findIndex(m => m.id === streamingMessageId);
                  if (idx !== -1) {
                    const updated = [...prev];
                    const existing = updated[idx].conciergeActions || [];
                    updated[idx] = {
                      ...updated[idx],
                      conciergeActions: [...existing, actionResult],
                    };
                    return updated;
                  }
                  return [
                    ...prev,
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: '',
                      timestamp: new Date().toISOString(),
                      conciergeActions: [actionResult],
                    },
                  ];
                });

                // Invalidate relevant queries so tab data refreshes after AI write actions
                if (result.success) {
                  const keys = getConciergeInvalidationKeys(name, tripId);
                  for (const queryKey of keys) {
                    conciergeQueryClient.invalidateQueries({ queryKey, exact: false });
                  }
                  // Also invalidate pending actions so auto-confirm picks them up
                  conciergeQueryClient.invalidateQueries({ queryKey: ['pendingActions', tripId] });
                }
              }
            },
            onReservationDraft: (draft: ReservationDraft) => {
              if (!isMounted.current) return;
              receivedAnyChunk = true;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === streamingMessageId);
                if (idx !== -1) {
                  const updated = [...prev];
                  const existing = updated[idx].reservationDrafts || [];
                  updated[idx] = {
                    ...updated[idx],
                    reservationDrafts: [...existing, draft],
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: '',
                    timestamp: new Date().toISOString(),
                    reservationDrafts: [draft],
                  },
                ];
              });
            },
            onSmartImportPreview: (preview: StreamSmartImportPreviewEvent) => {
              if (!isMounted.current) return;
              receivedAnyChunk = true;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === streamingMessageId);
                const previewData = {
                  previewEvents: preview.previewEvents,
                  tripId: preview.tripId,
                  totalEvents: preview.totalEvents,
                  duplicateCount: preview.duplicateCount,
                  lodgingName: preview.lodgingName,
                };
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], smartImportPreview: previewData };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: '',
                    timestamp: new Date().toISOString(),
                    smartImportPreview: previewData,
                  },
                ];
              });
            },
            onSmartImportStatus: (status: SmartImportStatus, message: string) => {
              if (!isMounted.current) return;
              receivedAnyChunk = true;
              setIsTyping(false);
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === streamingMessageId);
                const statusData = { status, message };
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], smartImportStatus: statusData };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: '',
                    timestamp: new Date().toISOString(),
                    smartImportStatus: statusData,
                  },
                ];
              });
            },
            onBulkDeletePreview: (preview: StreamBulkDeletePreviewEvent) => {
              if (!isMounted.current) return;
              receivedAnyChunk = true;
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === streamingMessageId);
                const previewData = {
                  previewEvents: preview.previewEvents,
                  previewToken: preview.previewToken,
                  tripId: preview.tripId,
                  totalEvents: preview.totalEvents,
                };
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], bulkDeletePreview: previewData };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: '',
                    timestamp: new Date().toISOString(),
                    bulkDeletePreview: previewData,
                  },
                ];
              });
            },
            // Handles the structured JSON-envelope trip_cards event from the AI Concierge.
            // Cards are split into hotels and flights and attached to the streaming message.
            onTripCards: (cards: TripCard[], message: string | null) => {
              if (!isMounted.current) return;
              receivedAnyChunk = true;

              const hotelCards: HotelResult[] = [];
              const flightCards: ChatMessage['functionCallFlights'] = [];

              for (const card of cards) {
                if (card.type === 'hotel') {
                  hotelCards.push({
                    id: card.id,
                    provider: card.provider,
                    title: card.title,
                    subtitle: card.subtitle,
                    badges: card.badges,
                    price: card.price,
                    dates: card.dates
                      ? { check_in: card.dates.check_in, check_out: card.dates.check_out }
                      : null,
                    location: card.location
                      ? {
                          city: card.location.city,
                          region: card.location.region,
                          country: card.location.country,
                        }
                      : null,
                    details: card.details
                      ? {
                          rating: card.details.rating,
                          reviews_count: card.details.reviews_count,
                          refundable: card.details.refundable,
                          amenities: card.details.amenities,
                        }
                      : null,
                    deep_links: card.deep_links,
                  });
                } else if (card.type === 'flight') {
                  const airportCodes = card.location?.airport_codes ?? [];
                  flightCards.push({
                    origin: airportCodes[0] ?? '',
                    destination: airportCodes[1] ?? '',
                    departureDate: card.dates?.depart?.split('T')[0] ?? '',
                    returnDate: undefined,
                    passengers: 1,
                    deeplink: card.deep_links?.primary ?? '',
                    provider: card.provider,
                    price: card.price,
                    airline: card.details?.airline,
                    flightNumber: card.details?.flight_number,
                    stops: card.details?.stops,
                    durationMinutes: card.details?.duration_minutes,
                    departTime: card.dates?.depart ?? null,
                    arriveTime: card.dates?.arrive ?? null,
                    refundable: card.details?.refundable,
                  });
                }
              }

              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === streamingMessageId);
                const patch: Partial<ChatMessage> = {};
                if (hotelCards.length > 0) patch.functionCallHotels = hotelCards;
                if (flightCards.length > 0) patch.functionCallFlights = flightCards;
                // If backend also sends a summary message string, use it as content
                if (message) patch.content = message;

                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], ...patch };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: message ?? '',
                    timestamp: new Date().toISOString(),
                    ...patch,
                  },
                ];
              });
            },
            onMetadata: (metadata: StreamMetadataEvent) => {
              if (metadata.keepAlive) {
                return;
              }
              setAiStatus('connected');
              updateStreamMsg(() => ({
                usage: metadata.usage,
                sources: metadata.sources as ChatMessage['sources'],
                googleMapsWidget: metadata.googleMapsWidget ?? undefined,
                googleMapsWidgetContextToken: metadata.googleMapsWidgetContextToken ?? undefined,
              }));
            },
            onError: (errorMsg: string) => {
              if (import.meta.env.DEV) {
                console.error('[Stream] Concierge streaming error:', errorMsg);
              }
              if (!isMounted.current) return;
              if (!receivedAnyChunk) {
                setIsTyping(false);
                setAiStatus('degraded');
                setMessages(prev => [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: 'assistant' as const,
                    content: generateFallbackResponse(
                      currentInput,
                      fallbackContext,
                      basecampLocation,
                    ),
                    timestamp: new Date().toISOString(),
                  },
                ]);
              } else {
                // Mid-stream failure: previously this branch did nothing, leaving the
                // typing indicator spinning forever on a half-rendered message with no
                // signal. Stop typing, mark degraded, and append a non-destructive
                // notice while preserving the partial content already shown.
                setIsTyping(false);
                setAiStatus('degraded');
                updateStreamMsg(msg => ({
                  content: `${msg.content ?? ''}\n\n_Response interrupted — please try again._`,
                }));
              }
            },
            onDone: () => {
              clearTimeout(streamTimer.id);
              streamAbortRef.current = null;
              if (!isMounted.current) return;
              setIsTyping(false);
              if (isLimitedPlan && !isDemoMode) {
                void refreshUsage();
              }
              if (!receivedAnyChunk) {
                setMessages(prev => {
                  // Check if cards/actions were already attached by tool calls
                  const existing = prev.find(m => m.id === streamingMessageId);
                  const hasCards = hasRenderableAssistantPayload(existing);
                  return [
                    ...prev.filter(m => m.id !== streamingMessageId),
                    {
                      id: streamingMessageId,
                      type: 'assistant' as const,
                      content: hasCards
                        ? "Here's what I found:"
                        : 'Sorry, I encountered an error processing your request.',
                      timestamp: new Date().toISOString(),
                      ...(existing?.functionCallHotels
                        ? { functionCallHotels: existing.functionCallHotels }
                        : {}),
                      ...(existing?.functionCallFlights
                        ? { functionCallFlights: existing.functionCallFlights }
                        : {}),
                      ...(existing?.functionCallPlaces
                        ? { functionCallPlaces: existing.functionCallPlaces }
                        : {}),
                      ...(existing?.pendingActions
                        ? { pendingActions: existing.pendingActions }
                        : {}),
                      ...(existing?.reservationDrafts
                        ? { reservationDrafts: existing.reservationDrafts }
                        : {}),
                      ...(existing?.smartImportPreview
                        ? { smartImportPreview: existing.smartImportPreview }
                        : {}),
                      ...(existing?.bulkDeletePreview
                        ? { bulkDeletePreview: existing.bulkDeletePreview }
                        : {}),
                      ...(existing?.smartImportStatus
                        ? { smartImportStatus: existing.smartImportStatus }
                        : {}),
                      ...(existing?.conciergeActions
                        ? { conciergeActions: existing.conciergeActions }
                        : {}),
                    },
                  ];
                });
              } else {
                updateStreamMsg(msg => {
                  const hasCards = hasRenderableAssistantPayload(msg);
                  return msg.content.length > 0 || hasCards
                    ? {}
                    : { content: 'Sorry, I encountered an error processing your request.' };
                });
                // Cache the completed response for offline fallback.
                // Use the locally accumulated string — no setState read needed.
                if (accumulatedStreamContent) {
                  const latestStreamingMessage = messagesRef.current.find(
                    msg => msg.id === streamingMessageId,
                  );
                  const cachedMsg: ChatMessage = latestStreamingMessage
                    ? { ...latestStreamingMessage, content: accumulatedStreamContent }
                    : {
                        id: streamingMessageId,
                        type: 'assistant',
                        content: accumulatedStreamContent,
                        timestamp: new Date().toISOString(),
                      };
                  conciergeCacheService.cacheMessage(
                    tripId,
                    currentInput,
                    cachedMsg,
                    userId ?? 'anonymous',
                  );

                  // Persist rich card metadata to the ai_queries row that the
                  // edge function already inserted.  We update the most recent
                  // row matching this user + trip + query text.
                  const richMeta = extractRichMetadata(latestStreamingMessage);
                  if (richMeta && userId) {
                    supabase
                      .from('ai_queries')
                      .update({ metadata: richMeta } as Record<string, unknown>)
                      .eq('trip_id', tripId)
                      .eq('user_id', userId)
                      .eq('query_text', currentInput)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .then(({ error: metaErr }) => {
                        if (metaErr && import.meta.env.DEV) {
                          console.warn(
                            '[Concierge] Failed to persist rich metadata:',
                            metaErr.message,
                          );
                        }
                      });
                  }
                }
              }
            },
          },
          { demoMode: isDemoMode },
        );

        streamAbortRef.current = streamHandle.abort;
        streamingStarted = true;

        resetStreamWatchdog();

        return;
      }

      // === NON-STREAMING FALLBACK (demo mode) ===
      const { data, error } = await invokeConciergeWithTimeout(requestBody, {
        demoMode: isDemoMode,
      });

      if (!data || error) {
        if (import.meta.env.DEV) {
          console.warn('AI service unavailable or timed out, using graceful degradation');
        }
        setAiStatus('degraded');

        const fallbackResponse = generateFallbackResponse(
          currentInput,
          fallbackContext,
          basecampLocation,
        );

        const assistantMessage: ChatMessage = {
          id: _uniqueId('assistant'),
          type: 'assistant',
          content: fallbackResponse,
          timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
        return;
      }

      setAiStatus('connected');

      const assistantMessage: ChatMessage = {
        id: _uniqueId('assistant'),
        type: 'assistant',
        content: data.response || 'Sorry, I encountered an error processing your request.',
        timestamp: new Date().toISOString(),
        usage: data.usage,
        sources: data.sources || data.citations,
        googleMapsWidget: data.googleMapsWidget,
        // Rich card fields from non-streaming fallback response
        ...(data.places && Array.isArray(data.places)
          ? { functionCallPlaces: data.places as ChatMessage['functionCallPlaces'] }
          : {}),
        ...(data.flights && Array.isArray(data.flights)
          ? { functionCallFlights: data.flights as ChatMessage['functionCallFlights'] }
          : {}),
        ...(data.hotels && Array.isArray(data.hotels)
          ? { functionCallHotels: data.hotels as unknown as ChatMessage['functionCallHotels'] }
          : {}),
        ...(data.conciergeActions && Array.isArray(data.conciergeActions)
          ? { conciergeActions: data.conciergeActions as ChatMessage['conciergeActions'] }
          : {}),
      };

      setMessages(prev => [...prev, assistantMessage]);
      // Persist to localStorage cache for offline fallback
      conciergeCacheService.cacheMessage(
        tripId,
        currentInput,
        assistantMessage,
        userId ?? 'anonymous',
      );
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('AI Concierge error:', error);
      }
      setAiStatus('error');

      try {
        const fallbackResponse = generateFallbackResponse(
          currentInput,
          fallbackContext,
          basecampLocation,
        );
        const errorMessage: ChatMessage = {
          id: _uniqueId('assistant'),
          type: 'assistant',
          content: `⚠️ **AI Service Temporarily Unavailable**\n\n${fallbackResponse}\n\n*Note: This is a basic response. Full AI features will return once the service is restored.*`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      } catch {
        const errorMessage: ChatMessage = {
          id: _uniqueId('assistant'),
          type: 'assistant',
          content: `I'm having trouble connecting to my AI services right now. Please try again in a moment.`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      if (!streamingStarted) {
        setIsTyping(false);
      }
    }
  };

  return { handleSendMessage };
}
