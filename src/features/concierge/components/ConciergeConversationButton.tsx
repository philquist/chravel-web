/**
 * ConciergeConversationButton — circular orb that toggles hands-free voice mode.
 * Luxury Dark gold accents; states mirror useConciergeConversationMode.
 */
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationState } from '../hooks/useConciergeConversationMode';

interface Props {
  active: boolean;
  state: ConversationState;
  onToggle: () => void;
  disabled?: boolean;
  liveTranscript?: string;
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
  disabled,
  liveTranscript,
}: Props) {
  const isBusy = state === 'transcribing' || state === 'sending';
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';

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
        {active && liveTranscript ? (
          <div className="text-gray-500 truncate italic">&ldquo;{liveTranscript}&rdquo;</div>
        ) : (
          <div className="text-gray-600 truncate">
            Hands-free — talk to your concierge like a phone call.
          </div>
        )}
      </div>

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
