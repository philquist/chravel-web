/**
 * RealtimeVoiceOverlay — full-screen immersive UI for bidirectional realtime voice.
 *
 * Layout (Grok/OpenAI style):
 *   - Assistant transcript ABOVE the gold wave line (what the concierge is saying)
 *   - Animated gold wave across the middle (energy reacts to listening/speaking)
 *   - User transcript BELOW the line (what you said)
 * Both transcripts stay readable so a missed/quiet response can always be read.
 */
import { useEffect, useMemo, useRef } from 'react';
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
  onEnd: () => void;
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
  // viewBox is 2× a 1000-wide tile so the drift keyframe (translateX -1000) loops seamlessly.
  const width = 2000;
  const midY = 100;
  const wavelength = 1000;
  const paths = useMemo(
    () => [
      { d: sinePath(width, midY, 26, wavelength, 0), stroke: '#feeaa5', opacity: 0.45, w: 2 },
      {
        d: sinePath(width, midY, 34, wavelength, Math.PI / 2),
        stroke: '#e8af48',
        opacity: 0.7,
        w: 2.5,
      },
      { d: sinePath(width, midY, 30, wavelength, Math.PI), stroke: '#c49746', opacity: 0.9, w: 3 },
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
      style={{ filter: 'drop-shadow(0 0 12px rgba(232,175,72,0.45))' }}
    >
      {/* Amplitude reacts to speaking/listening energy; eased for a living feel. */}
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
  onEnd,
}: RealtimeVoiceOverlayProps) {
  const assistantTurns = turns.filter(t => t.role === 'assistant');
  const userTurns = turns.filter(t => t.role === 'user');

  // Newest assistant text should hug the line (bottom of the upper region).
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const userScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    assistantScrollRef.current?.scrollTo({ top: assistantScrollRef.current.scrollHeight });
  }, [assistantTurns.length, turns]);

  const intensity =
    phase === 'speaking' && isPlaying ? 1 : phase === 'listening' && isCapturing ? 0.6 : 0.15;

  // Escape ends the session.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnd]);

  const overlay = (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-gradient-to-b from-[#0b0b0f] via-[#0d0c12] to-black/95 backdrop-blur-xl animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Voice concierge"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
      }}
    >
      {/* Header: status + close */}
      <div className="flex items-center justify-between px-5">
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
            phase === 'error' ? 'bg-red-500/15 text-red-300' : 'bg-[#c49746]/15 text-[#feeaa5]',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              phase === 'speaking'
                ? 'bg-[#e8af48] animate-pulse'
                : phase === 'listening'
                  ? 'bg-emerald-400 animate-pulse'
                  : phase === 'error'
                    ? 'bg-red-400'
                    : 'bg-[#c49746]',
            )}
          />
          {PHASE_LABEL[phase]}
        </div>
        <button
          type="button"
          onClick={onEnd}
          aria-label="End voice session"
          className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
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
          {assistantTurns.length === 0 ? (
            <p className="text-white/40 text-base">
              {phase === 'connecting'
                ? 'Starting your voice session…'
                : 'Say hello to your concierge.'}
            </p>
          ) : (
            assistantTurns.map((turn, i) => (
              <p
                key={turn.id}
                className={cn(
                  'leading-relaxed transition-colors',
                  i === assistantTurns.length - 1
                    ? 'text-[#feeaa5] text-2xl font-medium'
                    : 'text-white/45 text-lg',
                )}
              >
                {turn.text}
              </p>
            ))
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
          {userTurns.length === 0 ? (
            <p className="inline-flex items-center gap-2 text-white/35 text-sm">
              <Mic className="h-4 w-4" /> Your words appear here
            </p>
          ) : (
            userTurns.slice(-4).map((turn, i, arr) => (
              <p
                key={turn.id}
                className={cn(
                  i === arr.length - 1
                    ? 'text-white text-lg font-medium'
                    : 'text-white/40 text-base',
                )}
              >
                {turn.text}
              </p>
            ))
          )}
        </div>
      </div>

      {/* Error + end control */}
      <div className="shrink-0 px-6 pt-2 flex flex-col items-center gap-3">
        {errorMessage && phase === 'error' && (
          <p className="text-red-300 text-sm text-center max-w-md">{errorMessage}</p>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
        >
          End conversation
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
}
