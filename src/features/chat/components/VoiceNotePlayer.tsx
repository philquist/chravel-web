import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNotePlayerProps {
  src: string;
  /** Optional pre-computed amplitude buckets 0..1. */
  waveform?: number[];
  /** Optional known duration in ms (used until <audio> metadata resolves). */
  durationMs?: number;
  /** Style variant — own bubbles use gold-tinted controls. */
  isOwn?: boolean;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Generates a stable pseudo-random waveform when none is supplied. */
function fallbackWaveform(src: string, bars = 32): number[] {
  let hash = 0;
  for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    // Bias toward the middle so bars feel like speech
    const raw = (hash % 1000) / 1000;
    out.push(0.25 + raw * 0.7);
  }
  return out;
}

/**
 * iMessage/WhatsApp-style voice note bubble content:
 * play/pause · animated waveform scrubber · elapsed time · speed toggle.
 */
export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  src,
  waveform,
  durationMs,
  isOwn = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(
    durationMs ? durationMs / 1000 : 0,
  );
  const [rateIndex, setRateIndex] = useState(0);

  const bars = useMemo(() => {
    if (waveform && waveform.length > 0) return waveform;
    return fallbackWaveform(src);
  }, [waveform, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentSec(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentSec(0);
      audio.currentTime = 0;
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[rateIndex];
  }, [rateIndex]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, []);

  const seekFromEvent = useCallback(
    (clientX: number, target: HTMLElement) => {
      const audio = audioRef.current;
      if (!audio || !durationSec) return;
      const rect = target.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * durationSec;
      setCurrentSec(audio.currentTime);
    },
    [durationSec],
  );

  const progress = durationSec > 0 ? currentSec / durationSec : 0;
  const remaining = Math.max(0, durationSec - currentSec);

  const barActiveClass = isOwn ? 'bg-primary-foreground' : 'bg-primary';
  const barInactiveClass = isOwn ? 'bg-primary-foreground/30' : 'bg-foreground/25';

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 py-1 pr-1 select-none',
        'min-w-[180px] max-w-[260px]',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        className={cn(
          'flex items-center justify-center rounded-full shrink-0 transition-transform active:scale-95',
          'w-8 h-8',
          isOwn
            ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="translate-x-[1px]" />}
      </button>

      <div
        className="flex-1 flex items-center gap-[2px] h-7 cursor-pointer"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Voice note position"
        tabIndex={0}
        onClick={e => seekFromEvent(e.clientX, e.currentTarget as HTMLElement)}
      >
        {bars.map((amp, i) => {
          const barProgress = i / Math.max(1, bars.length - 1);
          const isActive = barProgress <= progress;
          const height = Math.max(3, Math.round(amp * 26));
          return (
            <div
              key={i}
              className={cn(
                'w-[2px] rounded-full transition-colors',
                isActive ? barActiveClass : barInactiveClass,
              )}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setRateIndex(i => (i + 1) % PLAYBACK_RATES.length)}
        aria-label="Change playback speed"
        className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums shrink-0',
          isOwn
            ? 'bg-primary-foreground/15 text-primary-foreground/90 hover:bg-primary-foreground/25'
            : 'bg-foreground/10 text-foreground/80 hover:bg-foreground/20',
        )}
      >
        {PLAYBACK_RATES[rateIndex]}x
      </button>

      <span
        className={cn(
          'text-[10px] tabular-nums shrink-0 min-w-[32px] text-right',
          isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        {isPlaying ? formatTime(currentSec) : formatTime(remaining || durationSec)}
      </span>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
};
