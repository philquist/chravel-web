import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticService as haptics } from '@/services/hapticService';
import { useVoiceRecorder, type VoiceRecordingResult } from '../hooks/useVoiceRecorder';

interface VoiceRecordButtonProps {
  onRecorded: (result: VoiceRecordingResult) => void | Promise<void>;
  disabled?: boolean;
  buttonClassName?: string;
  iconClassName?: string;
}

const CANCEL_THRESHOLD_PX = 60;

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Hold-to-record mic button (iMessage/WhatsApp style).
 * Slide left past the threshold to cancel; release to send.
 * Falls back gracefully when MediaRecorder isn't available.
 */
export const VoiceRecordButton: React.FC<VoiceRecordButtonProps> = ({
  onRecorded,
  disabled,
  buttonClassName,
  iconClassName,
}) => {
  const { isSupported, isRecording, isPreparing, elapsedMs, liveLevel, start, stop, cancel } =
    useVoiceRecorder();

  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const willCancelRef = useRef(false);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (disabled || !isSupported) return;
      e.preventDefault();
      startXRef.current = e.clientX;
      willCancelRef.current = false;
      setDragX(0);
      haptics.light();
      await start();
    },
    [disabled, isSupported, start],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (startXRef.current === null || !isRecording) return;
      const delta = Math.min(0, e.clientX - startXRef.current);
      setDragX(delta);
      willCancelRef.current = Math.abs(delta) >= CANCEL_THRESHOLD_PX;
    },
    [isRecording],
  );

  const finish = useCallback(async () => {
    if (startXRef.current === null) return;
    startXRef.current = null;
    setDragX(0);
    if (willCancelRef.current) {
      cancel();
      haptics.light();
      return;
    }
    const result = await stop();
    if (result) {
      haptics.light();
      await onRecorded(result);
    }
  }, [cancel, onRecorded, stop]);

  const handlePointerUp = useCallback(() => {
    void finish();
  }, [finish]);

  const handlePointerCancel = useCallback(() => {
    if (startXRef.current === null) return;
    startXRef.current = null;
    setDragX(0);
    cancel();
  }, [cancel]);

  // Safety: release any recording if the component unmounts mid-hold.
  useEffect(() => {
    return () => {
      if (isRecording) cancel();
    };
    // Only run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported) return null;

  const active = isRecording || isPreparing;
  const willCancel = willCancelRef.current;

  return (
    <div className="relative flex items-center">
      {active && (
        <div
          className={cn(
            'absolute right-full mr-2 flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap pointer-events-none',
            'bg-card/95 border border-border/60 backdrop-blur-md shadow-sm',
            willCancel && 'border-destructive/60 text-destructive',
          )}
          style={{ transform: `translateX(${dragX}px)` }}
        >
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              willCancel ? 'bg-destructive' : 'bg-destructive animate-pulse',
            )}
            style={{
              transform: `scale(${1 + liveLevel * 0.6})`,
              transition: 'transform 80ms linear',
            }}
          />
          <span className="text-xs tabular-nums font-medium">{formatElapsed(elapsedMs)}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            {willCancel ? (
              <>
                <Trash2 size={10} /> Release to cancel
              </>
            ) : (
              <>‹ Slide to cancel</>
            )}
          </span>
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-label={
          active ? 'Recording — release to send, slide left to cancel' : 'Hold to record voice note'
        }
        aria-pressed={active}
        disabled={disabled}
        className={cn(
          buttonClassName,
          active && 'ring-2 ring-destructive/60 scale-110',
          'transition-transform',
        )}
      >
        <Mic className={iconClassName} />
      </button>
    </div>
  );
};
