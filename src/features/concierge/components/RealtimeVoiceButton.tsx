/**
 * RealtimeVoiceButton — activation control + overlay for bidirectional realtime voice.
 *
 * Self-contained so the (complex) AIConciergeChat only needs a one-line mount. Gated
 * behind the `concierge_realtime_voice` kill switch — renders nothing when disabled.
 */
import { type RefObject, useCallback } from 'react';
import { AudioLines } from 'lucide-react';
import { useFeatureFlag } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import { CTA_BUTTON, CTA_ICON_SIZE } from '@/lib/ctaButtonStyles';
import { useRealtimeVoice } from '@/features/concierge/hooks/useRealtimeVoice';
import { RealtimeVoiceOverlay } from '@/features/concierge/components/RealtimeVoiceOverlay';

interface RealtimeVoiceButtonProps {
  tripId: string;
  className?: string;
  /** Called when a voice session starts, so the parent can pause dictation/typing flows. */
  onSessionStart?: () => void;
  /** Confine the voice overlay to this element (the chat window) instead of the viewport. */
  containerRef?: RefObject<HTMLElement | null>;
  /** Block starting a new voice session while preserving visible affordance. */
  disabled?: boolean;
}

export function RealtimeVoiceButton({
  tripId,
  className,
  onSessionStart,
  containerRef,
  disabled = false,
}: RealtimeVoiceButtonProps) {
  const enabled = useFeatureFlag('concierge_realtime_voice', true);
  const voice = useRealtimeVoice();

  const handleStart = useCallback(() => {
    if (!tripId || disabled) return;
    onSessionStart?.();
    void voice.start(tripId);
  }, [tripId, disabled, onSessionStart, voice]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleStart}
        disabled={voice.isActive || disabled}
        aria-label="Start voice conversation"
        title="Talk to your concierge"
        className={cn(CTA_BUTTON, className)}
      >
        <AudioLines size={CTA_ICON_SIZE} className="text-white" />
      </button>

      {voice.isActive && (
        <RealtimeVoiceOverlay
          phase={voice.phase}
          turns={voice.turns}
          isCapturing={voice.isCapturing}
          isPlaying={voice.isPlaying}
          errorMessage={voice.errorMessage}
          onEnd={voice.stop}
          containerRef={containerRef}
        />
      )}
    </>
  );
}
