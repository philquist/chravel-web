import React, { useState, useCallback } from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';
import { ChatMessage } from './types';
import { GoogleMapsWidget } from './GoogleMapsWidget';
import { ChatMessageWithGrounding } from '@/types/grounding';
import { MessageRenderer } from './MessageRenderer';
import { PlaceResultCards, PlaceResult } from './PlaceResultCards';
import { FlightResultCards, FlightResult } from './FlightResultCards';
import { HotelResultCards, HotelResult } from './HotelResultCards';
import { ConciergeActionCardGroup } from './ConciergeActionCardGroup';
import type { ConciergeActionResult } from './ConciergeActionCard';
import { PendingActionCard } from './PendingActionCard';
import { ReservationDraftCard } from './ReservationDraftCard';
import { SmartImportPreviewCard } from './SmartImportPreviewCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  ReservationDraft,
  SmartImportPreviewEvent,
  SmartImportStatus,
} from '@/services/conciergeGateway';
import type { TTSPlaybackState } from '@/hooks/useConciergeReadAloud';
import { useLinkPreviews } from '../hooks/useLinkPreviews';
import { useLinkPreviewActivation } from '../hooks/useLinkPreviewActivation';

/** Extended message shape that may carry rich function-call data from the concierge. */
interface RichChatMessage extends ChatMessage {
  functionCallPlaces?: PlaceResult[];
  functionCallFlights?: FlightResult[];
  functionCallHotels?: HotelResult[];
  conciergeActions?: ConciergeActionResult[];
  reservationDrafts?: ReservationDraft[];
  smartImportPreview?: {
    previewEvents: SmartImportPreviewEvent[];
    tripId: string;
    totalEvents: number;
    duplicateCount: number;
    lodgingName?: string;
  };
  smartImportStatus?: { status: SmartImportStatus; message: string };
  bulkDeletePreview?: {
    previewEvents: SmartImportPreviewEvent[];
    previewToken: string;
    tripId: string;
    totalEvents: number;
  };
  pendingActions?: Array<{
    id: string;
    toolName: string;
    actionType: string;
    message: string;
    title?: string;
    detail?: string | null;
  }>;
}

interface ChatMessagesProps {
  messages: (ChatMessage | ChatMessageWithGrounding)[];
  isTyping: boolean;
  showMapWidgets?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onTabChange?: (tab: string) => void;
  onSavePlace?: (place: PlaceResult) => void;
  onSaveFlight?: (flight: FlightResult) => void;
  onSaveHotel?: (hotel: HotelResult) => void;
  isUrlSaved?: (url: string) => boolean;
  isSaving?: boolean;
  onEditReservation?: (prefill: string) => void;
  /** Smart Import: confirm callback */
  onSmartImportConfirm?: (messageId: string, events: SmartImportPreviewEvent[]) => void;
  /** Smart Import: dismiss callback */
  onSmartImportDismiss?: (messageId: string) => void;
  /** Bulk Delete: confirm callback */
  onBulkDeleteConfirm?: (
    messageId: string,
    previewToken: string,
    events: SmartImportPreviewEvent[],
  ) => void;
  /** Bulk Delete: dismiss callback */
  onBulkDeleteDismiss?: (messageId: string) => void;
  onConfirmPendingAction?: (actionId: string) => void;
  onRejectPendingAction?: (actionId: string) => void;
  isConfirmingPendingAction?: boolean;
  isRejectingPendingAction?: boolean;
  /** Smart Import: per-message importing state */
  smartImportStates?: Record<
    string,
    { isImporting: boolean; result: { imported: number; failed: number } | null }
  >;
  /** Bulk Delete: per-message deletion state */
  bulkDeleteStates?: Record<
    string,
    {
      isImporting: boolean;
      result: { imported: number; failed: number; alreadyMissing?: number } | null;
    }
  >;
  /** TTS: current playback state */
  ttsPlaybackState?: TTSPlaybackState;
  /** TTS: message ID currently being played */
  ttsPlayingMessageId?: string | null;
  /** TTS: play callback */
  onTTSPlay?: (messageId: string) => void;
  /** TTS: stop callback */
  onTTSStop?: () => void;
}

export const ChatMessages = ({
  messages,
  isTyping,
  showMapWidgets = false,
  onDeleteMessage,
  onTabChange,
  onSavePlace,
  onSaveFlight,
  onSaveHotel,
  isUrlSaved,
  isSaving,
  onEditReservation,
  onSmartImportConfirm,
  onSmartImportDismiss,
  onBulkDeleteConfirm,
  onBulkDeleteDismiss,
  onConfirmPendingAction,
  onRejectPendingAction,
  isConfirmingPendingAction = false,
  isRejectingPendingAction = false,
  smartImportStates,
  bulkDeleteStates,
  ttsPlaybackState,
  ttsPlayingMessageId,
  onTTSPlay,
  onTTSStop,
}: ChatMessagesProps) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDeleteClick = useCallback((messageId: string) => {
    setPendingDeleteId(messageId);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (pendingDeleteId && onDeleteMessage) {
      onDeleteMessage(pendingDeleteId);
    }
    setPendingDeleteId(null);
  }, [pendingDeleteId, onDeleteMessage]);

  const handleDeleteCancel = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const linkPreviewEnabled = useLinkPreviewActivation(messages.length > 0);

  const linkPreviewFallbacks = useLinkPreviews(
    messages.map(message => {
      const candidate = message as { id: string; content?: string; link_preview?: unknown };
      return {
        id: candidate.id,
        text: candidate.content || '',
        linkPreview: candidate.link_preview,
      };
    }),
    { enabled: linkPreviewEnabled },
  );

  if (messages.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageCircle size={48} className="text-gray-600 mx-auto mb-4" />
        <h4 className="text-lg font-medium text-gray-400 mb-2">Start the conversation</h4>
        <p className="text-gray-500 text-sm">Send a message to get the chat started!</p>
      </div>
    );
  }

  return (
    <>
      {messages.map(message => {
        const renderedMessage = {
          ...message,
          link_preview:
            (message as { link_preview?: unknown }).link_preview ||
            linkPreviewFallbacks[message.id],
        };
        const messageWithGrounding = message as ChatMessageWithGrounding;
        const rich = message as RichChatMessage;
        return (
          <div
            key={message.id}
            id={`msg-${message.id}`}
            className="space-y-2 group/msg relative min-w-0 max-w-full overflow-x-hidden"
          >
            <MessageRenderer
              message={renderedMessage}
              showMapWidgets={showMapWidgets}
              ttsPlaybackState={ttsPlaybackState}
              ttsPlayingMessageId={ttsPlayingMessageId}
              onTTSPlay={onTTSPlay}
              onTTSStop={onTTSStop}
            />

            {/* Rich place cards from function_call results (searchPlaces / getPlaceDetails) */}
            {rich.functionCallPlaces && rich.functionCallPlaces.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <PlaceResultCards
                  places={rich.functionCallPlaces}
                  className="min-w-0 max-w-full sm:max-w-xs lg:max-w-md"
                  onSave={onSavePlace}
                  isUrlSaved={isUrlSaved}
                  isSaving={isSaving}
                />
              </div>
            )}

            {/* Rich flight cards from function_call results (searchFlights) */}
            {rich.functionCallFlights && rich.functionCallFlights.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <FlightResultCards
                  flights={rich.functionCallFlights}
                  className="min-w-0 max-w-full sm:max-w-xs lg:max-w-md"
                  onSave={onSaveFlight}
                  isSaved={isUrlSaved}
                  isSaving={isSaving}
                />
              </div>
            )}

            {/* Rich hotel cards from function_call results (searchHotels) or trip_cards event */}
            {rich.functionCallHotels && rich.functionCallHotels.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <HotelResultCards
                  hotels={rich.functionCallHotels}
                  className="min-w-0 max-w-full sm:max-w-xs lg:max-w-md"
                  onSave={onSaveHotel}
                  isSaved={isUrlSaved}
                  isSaving={isSaving}
                />
              </div>
            )}

            {/* Concierge action result cards (createPoll, createTask, savePlace, etc.) */}
            {rich.conciergeActions && rich.conciergeActions.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div className="min-w-0 max-w-full sm:max-w-xs lg:max-w-md w-full">
                  <ConciergeActionCardGroup
                    actions={rich.conciergeActions}
                    onNavigate={onTabChange}
                  />
                </div>
              </div>
            )}

            {/* Pending AI write actions that require explicit user confirmation */}
            {rich.pendingActions && rich.pendingActions.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div className="min-w-0 max-w-full sm:max-w-sm lg:max-w-md w-full space-y-2">
                  {rich.pendingActions.map(action => (
                    <PendingActionCard
                      key={action.id}
                      action={{
                        id: action.id,
                        trip_id: '',
                        user_id: '',
                        tool_name: action.toolName,
                        tool_call_id: null,
                        payload: {},
                        status: 'pending',
                        source_type: 'ai_concierge',
                        created_at: message.timestamp,
                        resolved_at: null,
                        resolved_by: null,
                      }}
                      title={action.title}
                      detail={action.detail}
                      onConfirm={onConfirmPendingAction || (() => undefined)}
                      onReject={onRejectPendingAction || (() => undefined)}
                      isConfirming={isConfirmingPendingAction}
                      isRejecting={isRejectingPendingAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Reservation draft cards */}
            {rich.reservationDrafts && rich.reservationDrafts.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div className="min-w-0 max-w-full space-y-2">
                  {rich.reservationDrafts.map(draft => (
                    <ReservationDraftCard key={draft.id} draft={draft} onEdit={onEditReservation} />
                  ))}
                </div>
              </div>
            )}

            {/* Smart Import status indicator (shown during parsing/extraction) */}
            {rich.smartImportStatus && !rich.smartImportPreview && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl min-w-0 max-w-full sm:max-w-sm ${
                    rich.smartImportStatus.status === 'failed'
                      ? 'border border-red-500/30 bg-red-500/10'
                      : 'border border-[#c49746]/20 bg-[#c49746]/5'
                  }`}
                >
                  {rich.smartImportStatus.status === 'failed' ? (
                    <div className="w-4 h-4 rounded-full bg-red-500/80 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 gold-gradient-spinner animate-spin shrink-0" />
                  )}
                  <span
                    className={`text-xs ${
                      rich.smartImportStatus.status === 'failed' ? 'text-red-200' : 'text-[#c49746]'
                    }`}
                  >
                    {rich.smartImportStatus.message}
                  </span>
                </div>
              </div>
            )}

            {/* Smart Import preview card */}
            {rich.smartImportPreview && rich.smartImportPreview.previewEvents.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div className="min-w-0 max-w-full sm:max-w-sm lg:max-w-md w-full">
                  <SmartImportPreviewCard
                    previewEvents={rich.smartImportPreview.previewEvents}
                    tripId={rich.smartImportPreview.tripId}
                    totalEvents={rich.smartImportPreview.totalEvents}
                    duplicateCount={rich.smartImportPreview.duplicateCount}
                    lodgingName={rich.smartImportPreview.lodgingName}
                    onConfirm={events => onSmartImportConfirm?.(message.id, events)}
                    onDismiss={() => onSmartImportDismiss?.(message.id)}
                    isImporting={smartImportStates?.[message.id]?.isImporting}
                    importResult={smartImportStates?.[message.id]?.result}
                  />
                </div>
              </div>
            )}

            {/* Bulk Delete preview card */}
            {rich.bulkDeletePreview && rich.bulkDeletePreview.previewEvents.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <div className="min-w-0 max-w-full sm:max-w-sm lg:max-w-md w-full">
                  <SmartImportPreviewCard
                    mode="delete"
                    previewEvents={rich.bulkDeletePreview.previewEvents}
                    tripId={rich.bulkDeletePreview.tripId}
                    totalEvents={rich.bulkDeletePreview.totalEvents}
                    duplicateCount={0}
                    onConfirm={events =>
                      onBulkDeleteConfirm?.(
                        message.id,
                        rich.bulkDeletePreview!.previewToken,
                        events,
                      )
                    }
                    onDismiss={() => onBulkDeleteDismiss?.(message.id)}
                    isImporting={bulkDeleteStates?.[message.id]?.isImporting}
                    importResult={bulkDeleteStates?.[message.id]?.result}
                  />
                </div>
              </div>
            )}
            {/* Delete button — shows on hover, triggers confirm modal */}
            {onDeleteMessage && (
              <div
                className={`flex items-center gap-1 ${message.type === 'user' ? 'justify-end' : 'justify-start'} ${message.type !== 'user' ? 'pl-10' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => handleDeleteClick(message.id)}
                  className="opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground/50 hover:text-destructive p-1 rounded"
                  aria-label="Delete message"
                  title="Delete message"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            {/* Render Maps widget for gmp-place-contextual context tokens.
                Prefer googleMapsWidgetContextToken (from maps grounding) over
                googleMapsWidget (from searchEntryPoint). */}
            {showMapWidgets &&
              (messageWithGrounding.googleMapsWidgetContextToken ||
                (messageWithGrounding.googleMapsWidget &&
                  !messageWithGrounding.googleMapsWidget.trimStart().startsWith('<'))) && (
                <div
                  className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <GoogleMapsWidget
                    widgetToken={
                      messageWithGrounding.googleMapsWidgetContextToken ||
                      messageWithGrounding.googleMapsWidget!
                    }
                  />
                </div>
              )}

            {/* 🆕 Enhanced: Show grounding sources with badge */}
            {messageWithGrounding.sources && messageWithGrounding.sources.length > 0 && (
              <div
                className={`flex min-w-0 max-w-full overflow-x-hidden ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="space-y-1.5 px-2 min-w-0 max-w-full sm:max-w-xs lg:max-w-md">
                  <div className="text-xs font-medium text-gray-400 flex items-center gap-2">
                    <span>Sources:</span>
                    {messageWithGrounding.sources.some(
                      s => s.source === 'google_maps_grounding',
                    ) && (
                      <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-[10px]">
                        Verified by Google Maps
                      </span>
                    )}
                  </div>
                  {messageWithGrounding.sources.map((source, idx) => {
                    const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(source.url);
                    let faviconUrl: string | null = null;
                    try {
                      faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}&sz=16`;
                    } catch {
                      // invalid URL, skip favicon
                    }
                    return (
                      <div
                        key={idx}
                        className="border border-gray-700/50 rounded-lg p-2 bg-gray-800/30 space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          {faviconUrl && (
                            <img
                              src={faviconUrl}
                              alt=""
                              width={16}
                              height={16}
                              className="shrink-0"
                            />
                          )}
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 truncate"
                          >
                            {source.title}
                          </a>
                        </div>
                        {source.snippet && (
                          <p className="text-[11px] text-gray-400 line-clamp-2">{source.snippet}</p>
                        )}
                        {isImageUrl && (
                          <img
                            src={source.url}
                            alt={source.title}
                            className="max-h-20 rounded mt-1"
                            loading="lazy"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {isTyping && (
        <div className="flex justify-start">
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-4 border border-blue-500/20">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
              <div
                className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              ></div>
              <div
                className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={open => !open && handleDeleteCancel()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
