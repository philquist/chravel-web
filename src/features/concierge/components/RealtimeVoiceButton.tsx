/**
 * RealtimeVoiceButton — activation control + overlay for bidirectional realtime voice.
 *
 * Self-contained so the (complex) AIConciergeChat only needs a one-line mount. The
 * `concierge_realtime_voice` kill switch is checked by the parent (AIConciergeChat)
 * so this component never renders when the flag is off — do NOT double-check it here
 * (a second useFeatureFlag caused hydration flicker + unmount races mid-session).
 */
import { type RefObject, useCallback } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
  /**
   * Block starting a new voice session (e.g. usage limit reached) while preserving
   * the visible affordance. We keep the DOM `disabled` off so the tap fires and we
   * can toast the reason — silently swallowing the click is what made the button
   * feel "broken".
   */
  disabled?: boolean;
}

export function RealtimeVoiceButton({
  tripId,
  className,
  onSessionStart,
  containerRef,
  disabled = false,
}: RealtimeVoiceButtonProps) {
  const voice = useRealtimeVoice();
  const isConnecting = voice.phase === 'connecting';
  const isSessionLive = voice.isActive; // connecting/listening/speaking/error

  const handleStart = useCallback(() => {
    if (!tripId) {
      toast.error('Open a trip before starting voice.');
      return;
    }
    if (disabled) {
      toast.error('Voice unavailable', {
        description: 'You\'ve hit your Concierge limit. Upgrade to keep asking.',
      });
      return;
    }
    if (isSessionLive) return;
    onSessionStart?.();
    void voice.start(tripId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not start voice session.';
      toast.error('Voice failed to start', { description: message });
    });
  }, [tripId, disabled, isSessionLive, onSessionStart, voice]);

  const label = isConnecting
    ? 'Connecting voice…'
    : isSessionLive
      ? 'Voice session active'
      : 'Start voice conversation';

  return (
    <>
      <button
        type="button"
        onClick={handleStart}
        // Only actually disable the DOM element when a session is already live —
        // usage-limit gating happens inside handleStart so we can toast the reason.
        disabled={isSessionLive}
        aria-label={label}
        aria-busy={isConnecting}
        title={label}
        className={cn(CTA_BUTTON, className)}
        data-testid="realtime-voice-button"
      >
        {isConnecting ? (
          <Loader2 size={CTA_ICON_SIZE} className="text-white animate-spin" />
        ) : (
          <AudioLines size={CTA_ICON_SIZE} className="text-white" />
        )}
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
