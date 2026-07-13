import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageReactionBar, REACTION_EMOJI_MAP } from './MessageReactionBar';
import { MessageActions } from './MessageActions';
import { GoogleMapsWidget } from './GoogleMapsWidget';
import { GroundingCitationCard } from './GroundingCitationCard';
import { ImageLightbox } from './ImageLightbox';
import { ReadReceipts, ReadStatus } from './ReadReceipts';
import { GroundingCitation } from '@/types/grounding';
import {
  MapPin,
  Maximize2,
  FileText,
  Download,
  Link,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  MessageSquareReply,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobilePortrait } from '@/hooks/useMobilePortrait';
import { useLongPress } from '@/hooks/useLongPress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/utils/avatarUtils';
import { defaultAvatar } from '@/utils/mockAvatars';
import { useResolvedTripMediaUrl } from '@/hooks/useResolvedTripMediaUrl';
import { hapticService } from '@/services/hapticService';
import { getMentionClassName, MENTION_REGEX } from './messageMentions';
import { ModerationAction } from '@/services/moderationService';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { BubbleTail } from './BubbleTail';
import { PlaceMiniCard, isPlaceLinkUrl } from './PlaceMiniCard';
import { VideoThumb, GifAutoplayImage } from './VideoThumb';
import { useFeatureFlag } from '@/lib/featureFlags';

// .webm omitted — ambiguous audio/video; require explicit type/mime for webm.
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|oga|opus|aac|caf)(\?|$)/i;
const isAudioAttachment = (att: { type: string; url?: string; mimeType?: string }) => {
  if (att.type === 'video') return false;
  if (att.mimeType?.startsWith('video/')) return false;
  if (att.type === 'audio') return true;
  if (att.mimeType?.startsWith('audio/')) return true;
  return !!att.url && AUDIO_EXT_RE.test(att.url);
};

export interface MessageBubbleProps {
  id: string;
  text: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
  isBroadcast?: boolean;
  isPayment?: boolean;
  isOwnMessage?: boolean;
  isEdited?: boolean;
  reactions?: Record<string, { count: number; userReacted: boolean; users?: string[] }>;
  onReaction: (messageId: string, reactionType: string) => void;
  showSenderInfo?: boolean;
  messageType?: 'channel' | 'trip';
  transportMode?: 'legacy' | 'stream';
  isDeleted?: boolean;
  onEdit?: (messageId: string, newContent: string) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  // Thread support
  replyCount?: number;
  threadPreviewSnippet?: string;
  hasUnreadThreadReplies?: boolean;
  onReply?: (messageId: string) => void;
  onOpenThread?: (messageId: string) => void;
  // 🆕 Grounding support
  grounding?: {
    sources?: GroundingCitation[];
    googleMapsWidget?: string;
    googleMapsWidgetContextToken?: string;
  };
  /** Last bubble in a consecutive same-sender group — shows the iMessage tail. */
  isLastInGroup?: boolean;
  // 🆕 Rich media support
  mediaType?: 'image' | 'video' | 'document' | 'audio' | 'file' | null;
  mediaUrl?: string | null;
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    domain?: string;
  } | null;
  attachments?: Array<{
    type: 'image' | 'video' | 'file' | 'link' | 'audio';
    ref_id: string;
    url?: string;
    /** Optional metadata for audio attachments (voice notes). */
    mimeType?: string;
    durationMs?: number;
    waveform?: number[];
    transcript?: string;
  }>;
  // 🆕 Gallery support - all images in chat for navigation
  allChatImages?: { url: string; caption?: string }[];
  // 🆕 Message status for retry UI
  status?: 'sending' | 'sent' | 'failed';
  onRetry?: (messageId: string) => void;
  // 🆕 Read Receipt Support
  tripMembers?: Array<{ id: string; name: string; avatar?: string }>;
  readStatuses?: ReadStatus[];
  currentUserId: string;
  // 🆕 Inline Reply Support
  replyTo?: { id: string; text: string; sender: string; createdAt?: string };
  reactionUserNamesById?: Record<string, string>;
  /** Admins can delete any message (server-side RLS enforced) */
  isAdmin?: boolean;
  canDeleteOwnMessage?: boolean;
  canDeleteAnyMessage?: boolean;
  canUpdateOwnMessage?: boolean;
  canManagePins?: boolean;
  isPinned?: boolean;
  /** Sender user ID for block/report actions */
  senderUserId?: string;
  onBlockUser?: (userId: string) => void;
  onTogglePin?: (messageId: string, shouldPin: boolean) => Promise<void> | void;
  onReportContent?: (params: {
    reportedUserId: string;
    messageId: string;
    reason: any;
    details?: string;
  }) => void;
  isBlockingUser?: boolean;
  isReportingContent?: boolean;
  canModerate?: boolean;
  onModerationAction?: (params: {
    messageId: string;
    targetUserId: string;
    action: ModerationAction;
  }) => Promise<void> | void;
}

export const MessageBubble = memo(
  ({
    id,
    text,
    senderName,
    senderAvatar,
    timestamp,
    isBroadcast,
    isPayment,
    isOwnMessage = false,
    isEdited = false,
    reactions,
    onReaction,
    messageType = 'trip',
    transportMode = 'legacy',
    isDeleted = false,
    onEdit,
    onDelete,
    replyCount = 0,
    threadPreviewSnippet,
    hasUnreadThreadReplies = false,
    onReply,
    onOpenThread,
    grounding,
    showSenderInfo = true,
    isLastInGroup = true,
    mediaType,
    mediaUrl,
    linkPreview,
    attachments,
    allChatImages = [],
    status,
    onRetry,
    tripMembers,
    readStatuses,
    currentUserId,
    replyTo,
    reactionUserNamesById,
    isAdmin = false,
    canDeleteOwnMessage = true,
    canDeleteAnyMessage = false,
    canUpdateOwnMessage = true,
    canManagePins = false,
    isPinned = false,
    senderUserId,
    onBlockUser,
    onTogglePin,
    onReportContent,
    isBlockingUser = false,
    isReportingContent = false,
    canModerate = false,
    onModerationAction,
  }: MessageBubbleProps) => {
    const [showReactions, setShowReactions] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [linkImgError, setLinkImgError] = useState(false);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [swipeThresholdMet, setSwipeThresholdMet] = useState(false);
    const swipeTouchStartX = useRef(0);
    const swipeTouchStartY = useRef(0);
    const swipeIsActive = useRef(false);
    const swipeHapticFired = useRef(false);
    const isMobilePortrait = useMobilePortrait();
    const reactionsEnabled = useFeatureFlag('chat_reactions_v2', true);
    const swipeReplyEnabled = useFeatureFlag('chat_swipe_reply', true);
    const mosaicEnabled = useFeatureFlag('chat_media_mosaic', true);
    const voiceNotesEnabled = useFeatureFlag('chat_voice_notes', true);

    // Check for media content
    const hasMedia = mediaType && mediaUrl;
    const hasLinkPreview = linkPreview && typeof linkPreview === 'object';
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

    const resolvedMediaUrl = useResolvedTripMediaUrl({ url: mediaUrl ?? null });

    // Handle image click - open lightbox
    const handleImageClick = (imageUrl: string) => {
      // Find the index of this image in the chat images array
      const index = allChatImages.findIndex(img => img.url === imageUrl);
      setLightboxIndex(index >= 0 ? index : 0);
      setLightboxOpen(true);
    };

    // Render media content based on type.
    // When Stream mapped a full attachments[] list, mosaic / voice / file rows own media
    // so we skip the single-media path to avoid double-rendering the first attachment.
    const renderMediaContent = () => {
      if (!hasMedia || hasAttachments) return null;

      switch (mediaType) {
        case 'image': {
          const imageSrc = (resolvedMediaUrl ?? mediaUrl) as string;
          const isGif = /\.gif(\?|$)/i.test(imageSrc);
          return (
            <div className="mt-2 relative group">
              {isGif ? (
                <GifAutoplayImage
                  src={imageSrc}
                  alt="Shared GIF"
                  className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={() => handleImageClick(imageSrc)}
                />
              ) : (
                <img
                  src={imageSrc}
                  alt="Shared image"
                  className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
                  style={{ maxHeight: '300px' }}
                  onClick={() => handleImageClick(imageSrc)}
                />
              )}
              <button
                onClick={() => handleImageClick(imageSrc)}
                className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="View full size"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          );
        }

        case 'video':
          return <VideoThumb src={(resolvedMediaUrl ?? mediaUrl) as string} className="mt-2" />;

        case 'document':
        case 'file':
          // Audio disguised as a document/file (voice notes via share path) — prefer player.
          if (mediaUrl && isAudioAttachment({ type: 'file', url: mediaUrl })) {
            return (
              <div className="mt-2">
                <VoiceNotePlayer
                  src={(resolvedMediaUrl ?? mediaUrl) as string}
                  isOwn={isOwnMessage}
                />
              </div>
            );
          }
          return (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
            >
              <FileText size={16} className="text-gray-400" />
              <span className="text-sm truncate flex-1">{text || 'Document'}</span>
              <Download size={14} className="text-gray-400" />
            </a>
          );

        case 'audio':
          if (!mediaUrl) return null;
          if (!voiceNotesEnabled) {
            return (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
              >
                <FileText size={16} className="text-gray-400" />
                <span className="text-sm truncate flex-1">Voice note</span>
                <Download size={14} className="text-gray-400" />
              </a>
            );
          }
          // Prefer attachment metadata (waveform/duration) when Stream mapped it.
          {
            const audioAttachment = attachments?.find(
              a => a.url === mediaUrl || a.type === 'audio',
            );
            return (
              <div className="mt-2">
                <VoiceNotePlayer
                  src={(resolvedMediaUrl ?? mediaUrl) as string}
                  waveform={audioAttachment?.waveform}
                  durationMs={audioAttachment?.durationMs}
                  transcript={audioAttachment?.transcript}
                  isOwn={isOwnMessage}
                />
              </div>
            );
          }

        default:
          return null;
      }
    };

    // Render file attachments — iMessage-style image mosaic + stacked non-image files
    const renderFileAttachments = () => {
      if (!hasAttachments) return null;

      const images = attachments.filter(a => a.type === 'image' && a.url);
      const nonImages = attachments.filter(a => a.type !== 'image');
      const visibleImages = images.slice(0, 4);
      const overflow = images.length - visibleImages.length;

      // Mosaic layout when flag is on; otherwise stack images vertically.
      const mosaicClass = !mosaicEnabled
        ? 'grid-cols-1'
        : visibleImages.length === 1
          ? 'grid-cols-1'
          : visibleImages.length === 2
            ? 'grid-cols-2'
            : 'grid-cols-2 grid-rows-2';

      return (
        <div className="mt-2 space-y-2">
          {visibleImages.length > 0 && (
            <div
              className={`grid gap-0.5 rounded-2xl overflow-hidden ${mosaicClass}`}
              style={{ maxWidth: mosaicEnabled ? '320px' : '280px' }}
            >
              {visibleImages.map((attachment, index) => {
                const isLastVisible = index === visibleImages.length - 1;
                const showOverflow = mosaicEnabled && overflow > 0 && isLastVisible;
                const spanClass =
                  mosaicEnabled && visibleImages.length === 3 && index === 0 ? 'row-span-2' : '';
                const isGif = /\.gif(\?|$)/i.test(attachment.url || '');
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleImageClick(attachment.url!)}
                    className={`relative group overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary ${spanClass}`}
                    aria-label={`View image ${index + 1}${showOverflow ? ` and ${overflow} more` : ''}`}
                  >
                    <img
                      src={attachment.url}
                      alt={`Attachment ${index + 1}`}
                      className={cn(
                        'w-full h-full object-cover hover:opacity-95 transition-opacity',
                        mosaicEnabled ? 'aspect-square' : 'max-h-[280px]',
                      )}
                      loading={isGif ? 'eager' : 'lazy'}
                    />
                    {showOverflow && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-xl font-semibold">
                        +{overflow}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {nonImages.map((attachment, index) => {
            if (attachment.url && isAudioAttachment(attachment)) {
              if (!voiceNotesEnabled) {
                return (
                  <a
                    key={`audio-file-${index}`}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-muted hover:bg-muted/70 px-3 py-2 rounded-lg transition-colors border border-border/50"
                  >
                    <FileText size={16} className="text-muted-foreground" />
                    <span className="text-sm truncate flex-1">Voice note</span>
                    <Download size={14} className="text-muted-foreground" />
                  </a>
                );
              }
              return (
                <VoiceNotePlayer
                  key={`audio-${index}`}
                  src={attachment.url}
                  waveform={attachment.waveform}
                  durationMs={attachment.durationMs}
                  transcript={attachment.transcript}
                  isOwn={isOwnMessage}
                />
              );
            }
            if (attachment.type === 'file' && attachment.url) {
              return (
                <a
                  key={`file-${index}`}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-muted hover:bg-muted/70 px-3 py-2 rounded-lg transition-colors border border-border/50"
                >
                  <FileText size={16} className="text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{text || 'File attachment'}</span>
                  <Download size={14} className="text-muted-foreground" />
                </a>
              );
            }
            return null;
          })}
        </div>
      );
    };

    // Render link preview — place mini-card for Maps/Places URLs, else polished link card
    const renderLinkPreview = () => {
      if (!hasLinkPreview) return null;

      const preview = linkPreview;
      const previewUrl = preview.url || text;
      if (isPlaceLinkUrl(previewUrl) || isPlaceLinkUrl(preview.domain)) {
        return (
          <PlaceMiniCard
            name={preview.title || preview.domain || 'Place'}
            url={previewUrl}
            image={preview.image}
            subtitle={preview.description || preview.domain}
          />
        );
      }

      return (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block bg-muted/60 hover:bg-muted rounded-2xl overflow-hidden transition-colors border border-border/50"
          style={{ maxWidth: '320px' }}
        >
          {preview.image && !linkImgError && (
            <img
              src={preview.image}
              alt={preview.title || 'Link preview'}
              className="w-full h-40 object-cover"
              loading="lazy"
              onError={() => setLinkImgError(true)}
            />
          )}
          <div className="p-3">
            <div className="flex items-start gap-2">
              <Link size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {preview.title || preview.domain || 'Link'}
                </h4>
                {preview.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {preview.description}
                  </p>
                )}
                {preview.domain && (
                  <p className="text-[11px] text-muted-foreground/80 mt-1 uppercase tracking-wide">
                    {preview.domain}
                  </p>
                )}
              </div>
              <ExternalLink size={14} className="text-muted-foreground flex-shrink-0" />
            </div>
          </div>
        </a>
      );
    };

    // Parse text and render @mentions with distinct styling AND Markdown support
    const renderContent = (content: string) => {
      const parts = content.split(MENTION_REGEX);

      return parts.map((part, index) => {
        if (part.match(MENTION_REGEX)) {
          // It's a mention
          return (
            <span key={index} className={getMentionClassName({ isOwnMessage, isBroadcast })}>
              {part}
            </span>
          );
        } else {
          // It's regular text (potentially markdown)
          return (
            <span
              key={index}
              className="inline prose prose-invert max-w-none prose-p:inline prose-p:m-0 prose-pre:bg-gray-800 prose-pre:p-2 prose-pre:rounded"
            >
              <ReactMarkdown
                components={{
                  p: props => <span {...props} />,
                  a: props => (
                    <a
                      {...props}
                      className="text-blue-400 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                  code: props => (
                    <code
                      {...props}
                      className="bg-gray-800 px-1 py-0.5 rounded text-xs font-mono"
                    />
                  ),
                }}
              >
                {part}
              </ReactMarkdown>
            </span>
          );
        }
      });
    };

    const formatTime = (timestamp: string) => {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    // Unified layout: Metadata above bubble for both mobile and desktop (consistency)
    const hideReactionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const longPressHandlers = useLongPress({
      onLongPress: () => {
        if (!reactionsEnabled) return;
        setShowReactions(true);
        // Auto-hide after 5 seconds on mobile long-press
        if (hideReactionsTimerRef.current) clearTimeout(hideReactionsTimerRef.current);
        hideReactionsTimerRef.current = setTimeout(() => setShowReactions(false), 5000);
      },
      threshold: 500,
    });

    // Swipe-to-reply touch handlers (mobile only, swipe right)
    const SWIPE_THRESHOLD = 60;
    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (!swipeReplyEnabled || !isMobilePortrait || !onReply) return;
        swipeTouchStartX.current = e.touches[0].clientX;
        swipeTouchStartY.current = e.touches[0].clientY;
        swipeIsActive.current = false;
        swipeHapticFired.current = false;
      },
      [swipeReplyEnabled, isMobilePortrait, onReply],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (!swipeReplyEnabled || !isMobilePortrait || !onReply) return;
        const dx = e.touches[0].clientX - swipeTouchStartX.current;
        const dy = e.touches[0].clientY - swipeTouchStartY.current;
        // Only activate for dominant rightward swipes
        if (!swipeIsActive.current) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll wins
          if (dx < 0) return; // leftward swipe — ignore
          swipeIsActive.current = true;
        }
        const clamped = Math.min(dx, SWIPE_THRESHOLD + 20);
        setSwipeOffset(clamped);
        const met = clamped >= SWIPE_THRESHOLD;
        if (met && !swipeHapticFired.current) {
          hapticService.light();
          swipeHapticFired.current = true;
        }
        setSwipeThresholdMet(met);
      },
      [swipeReplyEnabled, isMobilePortrait, onReply],
    );

    const handleTouchEnd = useCallback(() => {
      if (!swipeIsActive.current) return;
      if (swipeThresholdMet && onReply) {
        onReply(id);
      }
      setSwipeOffset(0);
      setSwipeThresholdMet(false);
      swipeIsActive.current = false;
      swipeHapticFired.current = false;
    }, [swipeThresholdMet, onReply, id]);

    // Merge longPress touch handlers with swipe-to-reply touch handlers
    // so both systems fire (longPress overrides were silently dropped before)
    const mergedTouchStart = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        longPressHandlers.onTouchStart(e);
        handleTouchStart(e);
      },
      [longPressHandlers, handleTouchStart],
    );
    const mergedTouchMove = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        longPressHandlers.onTouchMove(e);
        handleTouchMove(e);
      },
      [longPressHandlers, handleTouchMove],
    );
    const mergedTouchEnd = useCallback(
      (_e: React.TouchEvent<HTMLDivElement>) => {
        longPressHandlers.onTouchEnd();
        handleTouchEnd();
      },
      [longPressHandlers, handleTouchEnd],
    );
    const mergedMouseLeave = useCallback(() => {
      longPressHandlers.onMouseLeave();
    }, [longPressHandlers]);

    useEffect(() => {
      return () => {
        if (hideReactionsTimerRef.current) {
          clearTimeout(hideReactionsTimerRef.current);
        }
      };
    }, []);

    // Dismiss reaction bar on click outside
    useEffect(() => {
      if (!showReactions) return;

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target;

        if (
          target instanceof Element &&
          target.closest('[data-reaction-picker-root], [data-reaction-picker-popover]')
        ) {
          return;
        }

        setShowReactions(false);
      };

      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }, [showReactions]);

    return (
      <>
        <div
          className={cn('flex gap-2 group', isOwnMessage ? 'justify-end' : 'justify-start')}
          onMouseDown={longPressHandlers.onMouseDown}
          onMouseMove={longPressHandlers.onMouseMove}
          onMouseUp={longPressHandlers.onMouseUp}
          onMouseLeave={mergedMouseLeave}
          onTouchStart={mergedTouchStart}
          onTouchMove={mergedTouchMove}
          onTouchEnd={mergedTouchEnd}
        >
          {!isOwnMessage && showSenderInfo && (
            <Avatar className="w-8 h-8 md:w-10 md:h-10 border-2 border-border/50 flex-shrink-0">
              <AvatarImage src={senderAvatar || defaultAvatar} alt={senderName} />
              <AvatarFallback className="bg-muted text-muted-foreground text-xs md:text-sm font-semibold">
                {getInitials(senderName)}
              </AvatarFallback>
            </Avatar>
          )}
          {!isOwnMessage && !showSenderInfo && <div className="w-8 md:w-10 flex-shrink-0" />}

          {/* Swipe-to-reply hint icon */}
          {swipeOffset > 10 && (
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 mr-1 flex-shrink-0 transition-opacity',
                swipeThresholdMet ? 'opacity-100' : 'opacity-50',
              )}
            >
              <MessageSquareReply className="w-4 h-4 text-primary" />
            </div>
          )}

          <div
            className={cn(
              'relative flex flex-col max-w-[85%]',
              isOwnMessage ? 'items-end text-right' : 'items-start text-left',
            )}
            style={{
              transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
              transition: swipeOffset === 0 ? 'transform 0.2s ease' : undefined,
            }}
          >
            <div className="flex items-center gap-2">
              {showSenderInfo && (
                <span className="text-[10px] md:text-xs text-chat-meta mb-0.5">
                  {isOwnMessage ? 'You' : senderName} — {formatTime(timestamp)}
                  {isEdited && <span className="ml-1 text-chat-meta/80">(edited)</span>}
                </span>
              )}
              <MessageActions
                messageId={id}
                messageContent={text}
                messageType={messageType}
                transportMode={transportMode}
                isOwnMessage={isOwnMessage}
                isDeleted={isDeleted}
                isAdmin={isAdmin}
                canDeleteOwnMessage={canDeleteOwnMessage}
                canDeleteAnyMessage={canDeleteAnyMessage}
                canUpdateOwnMessage={canUpdateOwnMessage}
                canManagePins={canManagePins}
                isPinned={isPinned}
                senderUserId={senderUserId}
                onEdit={onEdit}
                onDelete={onDelete}
                onReply={onReply}
                onOpenThread={onOpenThread}
                onBlockUser={onBlockUser}
                onTogglePin={onTogglePin}
                onReportContent={onReportContent}
                isBlockingUser={isBlockingUser}
                isReportingContent={isReportingContent}
              />
            </div>
            <div
              className={cn(
                'relative px-3 py-2 md:px-4 md:py-2.5 rounded-2xl break-words',
                'text-sm md:text-base',
                isOwnMessage && !isBroadcast
                  ? 'bg-chat-own text-chat-own-foreground'
                  : !isBroadcast
                    ? 'bg-chat-other text-chat-other-foreground'
                    : '',
                isBroadcast && 'bg-[#B91C1C] text-white',
                isPayment && 'border-2 border-green-500/50',
                status === 'failed' && 'opacity-70 border-2 border-destructive/50',
                status === 'sending' && 'opacity-80',
                // Adjust styling for media-only messages
                (hasMedia || hasLinkPreview) && !text && 'p-1 bg-transparent',
                // Soften the corner that hosts the tail (iMessage notch).
                isLastInGroup && isOwnMessage && 'rounded-br-md',
                isLastInGroup && !isOwnMessage && 'rounded-bl-md',
              )}
            >
              {isLastInGroup && !((hasMedia || hasLinkPreview) && !text) && (
                <BubbleTail isOwn={isOwnMessage} isBroadcast={isBroadcast} />
              )}
              {/* Inline Reply Quote */}
              {replyTo && (
                <div
                  className={cn(
                    'mb-2 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer border-l-2',
                    isOwnMessage
                      ? 'bg-black/20 border-white/40 text-white/85'
                      : 'bg-chat-other/65 border-chat-other-foreground/35 text-chat-other-foreground',
                  )}
                  onClick={e => {
                    e.stopPropagation();
                    // Optional: Scroll to original message
                    const el = document.querySelector(`[data-message-id="${replyTo.id}"]`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('search-highlight-flash');
                      setTimeout(() => el.classList.remove('search-highlight-flash'), 1000);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold truncate">{replyTo.sender}</p>
                    {replyTo.createdAt && (
                      <p className="opacity-75 shrink-0">
                        {new Date(replyTo.createdAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <p className="truncate opacity-90">{replyTo.text}</p>
                </div>
              )}

              {/* Text content - with Markdown and Mentions */}
              {text && <div className="whitespace-pre-wrap">{renderContent(text)}</div>}

              {/* Rich media content */}
              {renderMediaContent()}

              {/* File attachments */}
              {renderFileAttachments()}

              {/* Link preview */}
              {renderLinkPreview()}

              {/* Message status indicator */}
              {status === 'sending' && (
                <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                  <div className="h-3 w-3 animate-spin gold-gradient-spinner" />
                  <span>Sending...</span>
                </div>
              )}

              {status === 'failed' && (
                <button
                  onClick={() => onRetry?.(id)}
                  className="flex items-center gap-1.5 mt-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>Failed to send</span>
                  <RotateCcw className="h-3 w-3 ml-1" />
                  <span className="underline">Retry</span>
                </button>
              )}
            </div>

            {/* Google Maps Widget — prefer context token from maps grounding */}
            {(grounding?.googleMapsWidgetContextToken || grounding?.googleMapsWidget) && (
              <div className="mt-2">
                <GoogleMapsWidget
                  widgetToken={
                    grounding.googleMapsWidgetContextToken || grounding.googleMapsWidget!
                  }
                  height={isMobilePortrait ? 200 : 250}
                />
              </div>
            )}

            {/* Grounding Sources */}
            {grounding?.sources && grounding.sources.length > 0 && (
              <div className={cn('space-y-2', 'mt-2', 'w-full')}>
                <div
                  className={cn(
                    'font-medium text-white/80 flex items-center gap-2',
                    isMobilePortrait ? 'text-[10px]' : 'text-xs',
                  )}
                >
                  <span>Sources:</span>
                  {grounding.sources.filter(s => s.source === 'google_maps_grounding').length >
                    0 && (
                    <span
                      className={cn(
                        'bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1',
                        isMobilePortrait ? 'text-[9px]' : 'text-[10px]',
                      )}
                    >
                      <MapPin size={isMobilePortrait ? 10 : 12} />
                      {
                        grounding.sources.filter(s => s.source === 'google_maps_grounding').length
                      }{' '}
                      verified by Google
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {grounding.sources.map((source, idx) => (
                    <GroundingCitationCard key={source.id || idx} citation={source} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* Persistent reaction chips — attached to bubble corner iMessage-style */}
            {reactionsEnabled &&
              reactions &&
              Object.keys(reactions).some(k => reactions[k].count > 0) && (
                <div
                  className={cn(
                    'flex flex-wrap gap-1 -mt-2.5 z-10 relative',
                    isOwnMessage ? 'justify-end pr-1' : 'justify-start pl-1',
                  )}
                >
                  {Object.entries(reactions)
                    .filter(([, data]) => data.count > 0)
                    .map(([reactionType, data]) => (
                      <button
                        key={reactionType}
                        onClick={() => onReaction(id, reactionType)}
                        className={cn(
                          'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] leading-none transition-colors shadow-sm ring-1 ring-background',
                          data.userReacted
                            ? 'bg-primary/25 border border-primary/50 text-primary'
                            : 'bg-muted border border-border/60 text-foreground/80 hover:bg-muted/80',
                        )}
                      >
                        <span>{REACTION_EMOJI_MAP[reactionType] || reactionType}</span>
                        <span className="font-medium">{data.count}</span>
                      </button>
                    ))}
                </div>
              )}

            {/* Reaction picker — side attached to message to avoid hover handoff to adjacent rows */}
            {reactionsEnabled && showReactions && (
              <div
                className={cn(
                  'absolute top-0 z-20',
                  isOwnMessage ? 'right-full mr-2' : 'left-full ml-2',
                )}
                onMouseEnter={() => {
                  if (hideReactionsTimerRef.current) clearTimeout(hideReactionsTimerRef.current);
                }}
                onMouseLeave={() => {
                  if (hideReactionsTimerRef.current) clearTimeout(hideReactionsTimerRef.current);
                  hideReactionsTimerRef.current = setTimeout(() => setShowReactions(false), 2000);
                }}
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
              >
                <MessageReactionBar
                  messageId={id}
                  reactions={reactions}
                  onReaction={onReaction}
                  onReactionApplied={() => setShowReactions(false)}
                  userNamesById={reactionUserNamesById}
                />
              </div>
            )}

            {/* Thread reply indicator */}
            {replyCount > 0 && (
              <div className="mt-1.5">
                {onOpenThread ? (
                  <button
                    onClick={() => onOpenThread(id)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-primary/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <MessageSquareReply className="h-3 w-3" />
                    <span>
                      {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                    {hasUnreadThreadReplies && (
                      <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                        New
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-primary/80">
                    <MessageSquareReply className="h-3 w-3" />
                    <span>
                      {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                    {hasUnreadThreadReplies && (
                      <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                        New
                      </span>
                    )}
                  </div>
                )}
                {threadPreviewSnippet && (
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                    {threadPreviewSnippet}
                  </p>
                )}
              </div>
            )}

            {/* Read Receipts — own messages show Delivered (empty) → gold ticks (read).
                Parent used to gate on readStatuses.length > 0, which made the Delivered
                branch in ReadReceipts unreachable. */}
            {isOwnMessage && status !== 'sending' && status !== 'failed' && (
              <ReadReceipts
                readStatuses={readStatuses || []}
                totalRecipients={tripMembers?.length ? tripMembers.length - 1 : 0}
                currentUserId={currentUserId}
                tripMembers={tripMembers}
              />
            )}
          </div>
        </div>

        {/* Image Lightbox */}
        <ImageLightbox
          isOpen={lightboxOpen}
          images={allChatImages.length > 0 ? allChatImages : mediaUrl ? [{ url: mediaUrl }] : []}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      </>
    );
  },
);
