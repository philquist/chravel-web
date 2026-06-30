/**
 * RealtimeVoiceButton — activation control + overlay for bidirectional realtime voice.
 *
 * Self-contained so the (complex) AIConciergeChat only needs a one-line mount. Gated
 * behind the `concierge_realtime_voice` kill switch — renders nothing when disabled.
 */
import { useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { useFeatureFlag } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import { useRealtimeVoice } from '@/features/concierge/hooks/useRealtimeVoice';
import { RealtimeVoiceOverlay } from '@/features/concierge/components/RealtimeVoiceOverlay';

interface RealtimeVoiceButtonProps {
  tripId: string;
  className?: string;
  /** Called when a voice session starts, so the parent can pause dictation/typing flows. */
  onSessionStart?: () => void;
}

export function RealtimeVoiceButton({
  tripId,
  className,
  onSessionStart,
}: RealtimeVoiceButtonProps) {
  const enabled = useFeatureFlag('concierge_realtime_voice', false);
  const voice = useRealtimeVoice();

  const handleStart = useCallback(() => {
    if (!tripId) return;
    onSessionStart?.();
    void voice.start(tripId);
  }, [tripId, onSessionStart, voice]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleStart}
        disabled={voice.isActive}
        aria-label="Start voice conversation"
        title="Talk to your concierge"
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full',
          'bg-gradient-to-br from-[#e8af48] to-[#c49746] text-black shadow-gold-glow',
          'transition hover:brightness-110 active:scale-95 disabled:opacity-50',
          className,
        )}
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {voice.isActive && (
        <RealtimeVoiceOverlay
          phase={voice.phase}
          turns={voice.turns}
          isCapturing={voice.isCapturing}
          isPlaying={voice.isPlaying}
          errorMessage={voice.errorMessage}
          onEnd={voice.stop}
        />
      )}
    </>
  );
}
