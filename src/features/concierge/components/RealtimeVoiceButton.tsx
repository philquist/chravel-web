/**
 * RealtimeVoiceButton — activation control + overlay for bidirectional realtime voice.
 *
 * Self-contained so the (complex) AIConciergeChat only needs a one-line mount. The
 * `concierge_realtime_voice` kill switch is checked by the parent (AIConciergeChat)
 * so this component never renders when the flag is off — do NOT double-check it here
 * (a second useFeatureFlag caused hydration flicker + unmount races mid-session).
 *
 * The heavy `useRealtimeVoice` hook (AI SDK realtime + mic + captions) is only mounted
 * after the user taps Start. Keeping it always-mounted caused teardown races: the hook's
 * unmount cleanup depends on a `stop` callback that can change identity when caption
 * helpers re-render, which silently aborted sessions right after start.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
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

interface RealtimeVoiceSessionProps {
  tripId: string;
  containerRef?: RefObject<HTMLElement | null>;
  onEnd: () => void;
}

function RealtimeVoiceSession({ tripId, containerRef, onEnd }: RealtimeVoiceSessionProps) {
  const voice = useRealtimeVoice();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void voice.start(tripId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not start voice session.';
      toast.error('Voice failed to start', { description: message });
      onEnd();
    });
  }, [tripId, voice, onEnd]);

  const handleEnd = useCallback(() => {
    voice.stop();
    onEnd();
  }, [voice, onEnd]);

  // Keep the overlay mounted while connecting / live / error so failures don't flash-vanish.
  if (!voice.isActive && voice.phase === 'idle') return null;

  return (
    <RealtimeVoiceOverlay
      phase={voice.phase}
      turns={voice.turns}
      isCapturing={voice.isCapturing}
      isPlaying={voice.isPlaying}
      errorMessage={voice.errorMessage}
      micPermission={voice.micPermission}
      isRecording={voice.isRecording}
      latestUserText={voice.latestUserText}
      latestAssistantText={voice.latestAssistantText}
      onEnd={handleEnd}
      containerRef={containerRef}
    />
  );
}

export function RealtimeVoiceButton({
  tripId,
  className,
  onSessionStart,
  containerRef,
  disabled = false,
}: RealtimeVoiceButtonProps) {
  const [sessionRequested, setSessionRequested] = useState(false);

  const handleStart = useCallback(() => {
    if (!tripId) {
      toast.error('Open a trip before starting voice.');
      return;
    }
    if (disabled) {
      toast.error('Voice unavailable', {
        description: "You've hit your Concierge limit. Upgrade to keep asking.",
      });
      return;
    }
    if (sessionRequested) return;
    onSessionStart?.();
    setSessionRequested(true);
  }, [tripId, disabled, sessionRequested, onSessionStart]);

  const handleEnd = useCallback(() => {
    setSessionRequested(false);
  }, []);

  const label = sessionRequested ? 'Voice session active' : 'Start voice conversation';

  return (
    <>
      <button
        type="button"
        onClick={handleStart}
        // Only disable the DOM element while a session is requested — usage-limit
        // gating happens inside handleStart so we can toast the reason.
        disabled={sessionRequested}
        aria-label={label}
        aria-busy={sessionRequested}
        title={label}
        className={cn(CTA_BUTTON, className)}
        data-testid="realtime-voice-button"
      >
        {sessionRequested ? (
          <Loader2 size={CTA_ICON_SIZE} className="text-white animate-spin" />
        ) : (
          <AudioLines size={CTA_ICON_SIZE} className="text-white" />
        )}
      </button>

      {sessionRequested && (
        <RealtimeVoiceSession tripId={tripId} containerRef={containerRef} onEnd={handleEnd} />
      )}
    </>
  );
}
