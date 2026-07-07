/**
 * RealtimeVoiceOverlay — full-screen immersive UI for bidirectional realtime voice.
 *
 * Layout (Grok/OpenAI style):
 *   - Assistant transcript ABOVE the gold wave line (what the concierge is saying)
 *   - Animated gold wave across the middle (energy reacts to listening/speaking)
 *   - User transcript BELOW the line (what you said)
 * Both transcripts stay readable so a missed/quiet response can always be read.
 *
 * Uses semantic theme tokens so the overlay adapts to light and dark mode instead
 * of hardcoding a dark palette.
 */
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  RealtimeTranscriptTurn,
  RealtimeVoicePhase,
} from '@/features/concierge/hooks/useRealtimeVoice';

interface RealtimeVoiceOverlayProps {
  phase: RealtimeVoicePhase;
  turns: RealtimeTranscriptTurn[];
  isCapturing: boolean;
  isPlaying: boolean;
  errorMessage: string | null;
  /** Latest in-progress user utterance (may not yet be a committed message). */
  latestUserText?: string;
  /** Latest in-progress assistant reply (may not yet be a committed message). */
  latestAssistantText?: string;
  onEnd: () => void;
  /**
   * Element to confine the overlay to (the concierge chat window). When provided, the
   * overlay renders `absolute inset-0` inside it instead of covering the whole viewport.
   * The element must be `position: relative`. Falls back to full-screen if absent.
   */
  containerRef?: RefObject<HTMLElement | null>;
}

const PHASE_LABEL: Record<RealtimeVoicePhase, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  listening: 'Listening',
  speaking: 'Speaking',
  error: 'Voice error',
};

/** Build a seamless-looping sine path spanning [0, width] (width should be 2× the viewport tile). */
function sinePath(
  width: number,
  midY: number,
  amplitude: number,
  wavelength: number,
  phase: number,
) {
  const segments: string[] = [];
  for (let x = 0; x <= width; x += 10) {
    const y = midY + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    segments.push(`${x},${y.toFixed(1)}`);
  }
  return `M${segments.join(' L')}`;
}

function GoldWave({ intensity }: { intensity: number }) {
  const width = 2000;
  const midY = 100;
  const wavelength = 1000;
  const paths = useMemo(
    () => [
      { d: sinePath(width, midY, 26, wavelength, 0), stroke: '#feeaa5', opacity: 0.55, w: 2 },
      {
        d: sinePath(width, midY, 34, wavelength, Math.PI / 2),
        stroke: '#e8af48',
        opacity: 0.8,
        w: 2.5,
      },
      { d: sinePath(width, midY, 30, wavelength, Math.PI), stroke: '#c49746', opacity: 0.95, w: 3 },
    ],
    [],
  );

  return (
    <svg
      className="w-full"
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
      height={160}
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 10px rgba(196,151,70,0.35))' }}
    >
      <g
        style={{
          transform: `scaleY(${0.35 + intensity * 0.95})`,
          transformOrigin: 'center',
          transition: 'transform 350ms ease-out',
        }}
      >
        <g className="realtime-wave-drift">
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.stroke}
              strokeOpacity={p.opacity}
              strokeWidth={p.w}
              strokeLinecap="round"
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

export function RealtimeVoiceOverlay({
  phase,
  turns,
  isCapturing,
  isPlaying,
  errorMessage,
  latestUserText,
  latestAssistantText,
  onEnd,
  containerRef,
}: RealtimeVoiceOverlayProps) {
  const assistantTurns = turns.filter(t => t.role === 'assistant');
  const userTurns = turns.filter(t => t.role === 'user');

  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const userScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    assistantScrollRef.current?.scrollTo({ top: assistantScrollRef.current.scrollHeight });
  }, [assistantTurns.length, turns, latestAssistantText]);

  const intensity =
    phase === 'speaking' && isPlaying ? 1 : phase === 'listening' && isCapturing ? 0.6 : 0.15;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnd]);

  const target = containerRef?.current ?? null;

  // Determine what to render above/below the wave.
  const hasAssistantTurns = assistantTurns.length > 0;
  const hasUserTurns = userTurns.length > 0;
  const liveAssistant = latestAssistantText?.trim() ?? '';
  const liveUser = latestUserText?.trim() ?? '';

  const assistantEmptyCopy =
    phase === 'connecting'
      ? 'Starting your voice session…'
      : phase === 'listening' || phase === 'speaking'
        ? 'Listening — say hello to your concierge.'
        : 'Say hello to your concierge.';

  const overlay = (
    <div
      className={cn(
        'z-[120] flex flex-col bg-gradient-to-b from-background via-background to-muted/40 backdrop-blur-xl animate-fade-in',
        target ? 'absolute inset-0' : 'fixed inset-0',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Voice concierge"
      style={
        target
          ? { paddingTop: 16, paddingBottom: 16 }
          : {
              paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            }
      }
    >
      {/* Header: status + close */}
      <div className="flex items-center justify-between px-5">
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border',
            phase === 'error'
              ? 'bg-destructive/15 text-destructive border-destructive/30'
              : 'bg-gold-primary/15 text-gold-primary border-gold-primary/30',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              phase === 'speaking'
                ? 'bg-gold-primary animate-pulse'
                : phase === 'listening'
                  ? 'bg-emerald-500 animate-pulse'
                  : phase === 'error'
                    ? 'bg-destructive'
                    : 'bg-gold-primary',
            )}
          />
          {PHASE_LABEL[phase]}
        </div>
        <button
          type="button"
          onClick={onEnd}
          aria-label="End voice session"
          className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Assistant transcript — ABOVE the line */}
      <div
        ref={assistantScrollRef}
        className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col justify-end items-center text-center"
      >
        <div className="w-full max-w-2xl space-y-3">
          {!hasAssistantTurns && !liveAssistant ? (
            <p className="text-muted-foreground text-base">{assistantEmptyCopy}</p>
          ) : (
            <>
              {assistantTurns.slice(0, -1).map(turn => (
                <p key={turn.id} className="leading-relaxed text-muted-foreground text-lg">
                  {turn.text}
                </p>
              ))}
              {(() => {
                const last = assistantTurns[assistantTurns.length - 1];
                const text = liveAssistant || last?.text || '';
                if (!text) return null;
                return (
                  <p
                    key={last?.id ?? 'live-assistant'}
                    className="leading-relaxed text-foreground text-2xl font-medium"
                  >
                    {text}
                  </p>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* The gold wave line */}
      <div className="relative shrink-0 px-2">
        <GoldWave intensity={intensity} />
      </div>

      {/* User transcript — BELOW the line */}
      <div
        ref={userScrollRef}
        className="flex-1 overflow-y-auto px-6 pt-4 flex flex-col items-center text-center"
      >
        <div className="w-full max-w-2xl space-y-2">
          {!hasUserTurns && !liveUser ? (
            <p className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <Mic className="h-4 w-4" /> Your words appear here
            </p>
          ) : (
            <>
              {userTurns.slice(-4, -1).map(turn => (
                <p key={turn.id} className="text-muted-foreground text-base">
                  {turn.text}
                </p>
              ))}
              {(() => {
                const last = userTurns[userTurns.length - 1];
                const text = liveUser || last?.text || '';
                if (!text) return null;
                return (
                  <p
                    key={last?.id ?? 'live-user'}
                    className="text-foreground text-lg font-medium"
                  >
                    {text}
                  </p>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Error + end control */}
      <div className="shrink-0 px-6 pt-2 flex flex-col items-center gap-3">
        {errorMessage && phase === 'error' && (
          <p className="text-destructive text-sm text-center max-w-md">{errorMessage}</p>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="rounded-full bg-muted px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/80"
        >
          End conversation
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, target ?? document.body);
}
