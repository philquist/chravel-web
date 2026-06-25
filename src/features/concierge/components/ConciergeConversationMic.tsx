/**
 * ConciergeConversationMic — compact, icon-only toggle for hands-free voice mode.
 *
 * Lives INSIDE the concierge composer row, immediately to the left of the
 * textarea and next to the dictation (speech-to-text) button, so users can pick
 * either input mode without the composer giving up vertical chat space. All
 * status (listening / thinking / speaking) is conveyed by the icon + pulsing
 * ring; tapping again ends the conversation, so no separate Stop control or
 * call-to-action copy is needed. States mirror useConciergeConversationMode.
 */
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationState } from '../hooks/useConciergeConversationMode';

interface Props {
  active: boolean;
  state: ConversationState;
  onToggle: () => void;
  disabled?: boolean;
}

const STATE_LABEL: Record<ConversationState, string> = {
  idle: 'Start hands-free conversation',
  listening: 'Listening — tap to stop',
  transcribing: 'Transcribing — tap to stop',
  sending: 'Thinking — tap to stop',
  speaking: 'Speaking — tap to stop',
  error: 'Conversation error — tap to retry',
};

export function ConciergeConversationMic({ active, state, onToggle, disabled }: Props) {
  const isBusy = state === 'transcribing' || state === 'sending';
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const label = STATE_LABEL[state] ?? 'Conversation mode';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'relative size-11 min-w-[44px] rounded-full flex items-center justify-center shrink-0',
        'border select-none touch-manipulation transition-all duration-200',
        'active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
        active
          ? 'border-transparent bg-gradient-to-br from-gold-primary to-gold-mid text-black shadow-[0_0_18px_rgba(196,151,70,0.5)]'
          : 'border-white/10 bg-white/5 text-gold-mid hover:bg-white/10',
      )}
    >
      {isBusy ? (
        <Loader2 className="size-[18px] animate-spin" />
      ) : isSpeaking ? (
        <Volume2 className="size-[18px]" />
      ) : active ? (
        <MicOff className="size-[18px]" />
      ) : (
        <Mic className="size-[18px]" />
      )}

      {/* Pulsing ring while actively listening or speaking. */}
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
  );
}
