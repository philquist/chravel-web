/**
 * ConciergeConversationButton — circular orb that toggles hands-free voice mode,
 * paired with a Stop pill for immediate cancellation while a turn is in flight.
 * Luxury Dark gold accents; states mirror useConciergeConversationMode.
 */
import { Mic, MicOff, Loader2, Volume2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationState } from '../hooks/useConciergeConversationMode';

interface Props {
  active: boolean;
  state: ConversationState;
  onToggle: () => void;
  onCancel: () => void;
  disabled?: boolean;
  liveTranscript?: string;
  lastFinalTranscript?: string;
}

const STATE_LABEL: Record<ConversationState, string> = {
  idle: 'Start conversation',
  listening: 'Listening…',
  transcribing: 'Got it…',
  sending: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Tap to retry',
};

export function ConciergeConversationButton({
  active,
  state,
  onToggle,
  onCancel,
  disabled,
  liveTranscript,
  lastFinalTranscript,
}: Props) {
  const isBusy = state === 'transcribing' || state === 'sending';
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';

  // Bottom-line text: live (this turn) > last final transcript > tagline.
  const bottomLine =
    (active && liveTranscript) || lastFinalTranscript || '';
  const showQuoted = !!bottomLine;

  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-2">
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <div
          className={cn(
            'font-medium truncate',
            active ? 'text-gold-mid' : 'text-gray-400',
          )}
        >
          {active ? STATE_LABEL[state] : 'Conversation mode'}
        </div>
        {showQuoted ? (
          <div
            className="text-gray-400 italic line-clamp-2"
            title={bottomLine}
          >
            &ldquo;{bottomLine}&rdquo;
          </div>
        ) : (
          <div className="text-gray-600 truncate">
            Hands-free — talk to your concierge like a phone call.
          </div>
        )}
      </div>

      {/* Stop pill — only while a turn is in flight. */}
      {active && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Stop conversation"
          className={cn(
            'h-9 min-w-[64px] px-3 rounded-full inline-flex items-center gap-1.5 shrink-0',
            'border border-red-500/40 bg-red-500/10 text-red-300',
            'text-xs font-medium select-none touch-manipulation',
            'active:scale-95 transition-transform hover:bg-red-500/20',
          )}
        >
          <Square className="size-3.5 fill-current" />
          Stop
        </button>
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={active}
        aria-label={active ? 'End conversation' : 'Start conversation'}
        className={cn(
          'relative size-12 min-w-[48px] rounded-full flex items-center justify-center shrink-0',
          'border border-white/10 select-none touch-manipulation transition-all duration-200',
          'active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
          active
            ? 'bg-gradient-to-br from-gold-primary to-gold-mid text-black shadow-[0_0_24px_rgba(196,151,70,0.55)]'
            : 'bg-white/5 text-gold-mid hover:bg-white/10',
        )}
      >
        {isBusy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="size-5" />
        ) : active ? (
          <MicOff className="size-5" />
        ) : (
          <Mic className="size-5" />
        )}

        {/* Pulsing ring when listening or speaking */}
        {(isListening || isSpeaking) && (
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 rounded-full border-2 border-gold-mid',
              isListening ? 'animate-ping' : 'animate-pulse',
            )}
          />
        )}
      </button>
    </div>
  );
}
