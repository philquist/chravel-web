import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X, CalendarPlus, Bookmark, ListChecks, Upload } from 'lucide-react';
import type { VoiceState } from '@/hooks/useWebSpeechVoice';
import { CTA_BUTTON, CTA_ICON_SIZE } from '@/lib/ctaButtonStyles';

interface AiChatInputProps {
  inputMessage: string;
  onInputChange: (message: string) => void;
  onSendMessage: () => void | Promise<void>;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isTyping: boolean;
  disabled?: boolean;
  /** Dictation state — drives Listening placeholder when waveform dictation is active */
  convoVoiceState?: VoiceState;
  /** Whether voice/dictation features are available (listening UI) */
  isVoiceEligible?: boolean;
  /** Multimodal: callback when user selects images */
  onImageAttach?: (files: File[]) => void;
  /** Multimodal: currently attached image previews */
  attachedImages?: File[];
  /** Multimodal: remove an attached image by index */
  onRemoveImage?: (index: number) => void;
  /** Whether image attach is enabled */
  showImageAttach?: boolean;
  /** Callback when a Smart Import quick action chip is tapped */
  onQuickAction?: (action: string) => void;
  /** Callback when user drops or selects document files (PDF, ICS, CSV) */
  onDocumentAttach?: (files: File[]) => void;
  /** Callback when user drops or pastes unsupported files */
  onRejectedFiles?: (files: File[]) => void;
  /** Currently attached document files */
  attachedDocuments?: File[];
  /** Remove an attached document by index */
  onRemoveDocument?: (index: number) => void;
  /** Accepted MIME types for file drop/paste (images + documents) */
  acceptedFileTypes?: Set<string>;
  /**
   * Primary left-of-field control. Concierge App Store path mounts the waveform
   * dictation button here — no duplicate in-field mic.
   */
  leftAccessory?: React.ReactNode;
}

export const AiChatInput = ({
  inputMessage,
  onInputChange,
  onSendMessage,
  onKeyPress,
  isTyping,
  disabled = false,
  convoVoiceState = 'idle',
  isVoiceEligible = false,
  onImageAttach: _onImageAttach,
  attachedImages = [],
  onRemoveImage,
  showImageAttach: _showImageAttach = false,
  onQuickAction,
  onDocumentAttach,
  onRejectedFiles,
  attachedDocuments = [],
  onRemoveDocument,
  acceptedFileTypes,
  leftAccessory,
}: AiChatInputProps) => {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const urls = attachedImages.map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [attachedImages]);

  // ── File classification helper ────────────────────────────────────────
  const classifyFiles = useCallback(
    (files: File[]) => {
      const images: File[] = [];
      const documents: File[] = [];
      const rejected: File[] = [];
      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/.test(lowerName)) {
          images.push(file);
        } else if (
          acceptedFileTypes?.has(file.type) ||
          lowerName.endsWith('.pdf') ||
          lowerName.endsWith('.ics') ||
          lowerName.endsWith('.csv') ||
          lowerName.endsWith('.xlsx') ||
          lowerName.endsWith('.xls')
        ) {
          documents.push(file);
        } else {
          rejected.push(file);
        }
      }
      if (images.length > 0) _onImageAttach?.(images);
      if (documents.length > 0) onDocumentAttach?.(documents);
      if (rejected.length > 0) onRejectedFiles?.(rejected);
    },
    [_onImageAttach, onDocumentAttach, onRejectedFiles, acceptedFileTypes],
  );

  // ── Drag-and-drop handlers ────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        classifyFiles(files);
        return;
      }

      // Handle dropped text (e.g., itinerary text dragged from another app)
      const text = e.dataTransfer.getData('text/plain');
      if (text && text.trim().length > 0) {
        onInputChange(text);
      }
    },
    [classifyFiles, onInputChange],
  );

  // ── Paste handler (images + text) ──────────────────────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        classifyFiles(pastedFiles);
      }
      // If no files, let the default paste behavior handle text
    },
    [classifyFiles],
  );

  // Dictation active state — driven by the leftAccessory waveform button
  const isConvoActive =
    isVoiceEligible && convoVoiceState !== 'idle' && convoVoiceState !== 'error';

  // Dynamic placeholder based on active mode
  const getPlaceholder = () => {
    if (isConvoActive) return 'Listening\u2026';
    // Subtle affordance so the pill never looks like a dead black gutter on mobile.
    return 'Ask anything about this trip\u2026';
  };

  const hasAttachments = attachedImages.length > 0 || attachedDocuments.length > 0;
  const canSend = Boolean(inputMessage.trim()) || hasAttachments;
  const sendBlocked = !canSend || isTyping || disabled;
  const sendDomDisabled = isTyping || disabled;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBlocked) void onSendMessage();
    } else {
      onKeyPress(e);
    }
  };

  const handleSendClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (sendBlocked) return;
    void onSendMessage();
  };

  return (
    <div
      ref={dropZoneRef}
      className="space-y-2 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/10 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-1 text-primary">
            <Upload size={24} />
            <span className="text-xs font-medium">Drop files, images, or itineraries here</span>
          </div>
        </div>
      )}

      {/* Image Previews */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 px-1 overflow-x-auto">
          {attachedImages.map((file, idx) => (
            <div
              key={idx}
              className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10"
            >
              <img
                src={previewUrls[idx] ?? ''}
                alt={file.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveImage?.(idx)}
                className="absolute top-0 right-0 bg-black/70 rounded-bl-lg p-0.5"
                aria-label="Remove image"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Document Previews */}
      {attachedDocuments.length > 0 && (
        <div className="flex gap-2 px-1 overflow-x-auto">
          {attachedDocuments.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="text-xs text-white/70 truncate max-w-[120px]">{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveDocument?.(idx)}
                className="text-white/50 hover:text-white"
                aria-label="Remove document"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Smart Import quick action chips — shown when files are attached */}
      {hasAttachments && onQuickAction && (
        <div className="flex gap-2 px-1 overflow-x-auto">
          {[
            { key: 'add_to_calendar', label: 'Add to calendar', icon: CalendarPlus },
            { key: 'save_to_trip', label: 'Save to trip', icon: Bookmark },
            { key: 'create_tasks', label: 'Create tasks', icon: ListChecks },
          ].map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onQuickAction(chip.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30 transition-colors whitespace-nowrap"
            >
              <chip.icon size={12} />
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="chat-composer flex flex-nowrap items-center gap-2 sm:gap-3 min-w-0">
        {/* Primary left control — waveform dictation (App Store path). */}
        {leftAccessory}

        {/* Text field — no in-field mic; dictation lives on leftAccessory only. */}
        <div className="relative flex-1 min-w-0 rounded-full">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={e => onInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            placeholder={getPlaceholder()}
            rows={2}
            disabled={disabled}
            aria-label={
              isConvoActive
                ? 'Dictation in progress. Speak to add text.'
                : 'Message your AI Concierge'
            }
            className={`w-full bg-white/5 border rounded-2xl py-3 pl-4 pr-4 text-white placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 backdrop-blur-sm resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              isConvoActive ? 'border-primary/30 bg-primary/5' : 'border-white/10'
            }`}
          />
          {/* Dictation active indicator for screen readers */}
          {isConvoActive && (
            <span className="sr-only" role="status" aria-live="polite">
              Dictation active. Speak to add text to the message field.
            </span>
          )}
        </div>

        {/*
          Send keeps the same gold-ring CTA chrome as Search / Upload / Dictation
          even when the composer is empty. Empty taps are a no-op via handleSendClick,
          while aria-disabled still tells assistive tech that nothing can be sent yet.
        */}
        <button
          type="button"
          onClick={handleSendClick}
          disabled={sendDomDisabled}
          aria-label="Send message"
          aria-disabled={sendBlocked}
          title={
            sendBlocked
              ? isTyping
                ? 'Sending\u2026'
                : 'Type a message or attach a file to send'
              : 'Send message'
          }
          data-testid="concierge-send-btn"
          className={CTA_BUTTON}
        >
          <Send size={CTA_ICON_SIZE} />
        </button>
      </div>
    </div>
  );
};
