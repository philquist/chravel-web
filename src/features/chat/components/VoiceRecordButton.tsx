import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Mic, Send, Trash2 } from 'lucide-react';
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
const LOCK_THRESHOLD_PX = 60;

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Hold-to-record mic button (iMessage/WhatsApp style).
 * Slide left ≥60px to cancel; slide up ≥60px to lock (hands-free); release to send.
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
  const [dragY, setDragY] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const willCancelRef = useRef(false);
  const willLockRef = useRef(false);

  const resetDrag = useCallback(() => {
    startXRef.current = null;
    startYRef.current = null;
    setDragX(0);
    setDragY(0);
    willCancelRef.current = false;
    willLockRef.current = false;
  }, []);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (disabled || !isSupported || isLocked) return;
      e.preventDefault();
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      willCancelRef.current = false;
      willLockRef.current = false;
      setDragX(0);
      setDragY(0);
      haptics.light();
      await start();
    },
    [disabled, isSupported, isLocked, start],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isLocked) return;
      if (startXRef.current === null || startYRef.current === null || !isRecording) return;
      const deltaX = Math.min(0, e.clientX - startXRef.current);
      const deltaY = Math.min(0, e.clientY - startYRef.current);
      setDragX(deltaX);
      setDragY(deltaY);

      const canceling = Math.abs(deltaX) >= CANCEL_THRESHOLD_PX && Math.abs(deltaX) >= Math.abs(deltaY);
      const locking = Math.abs(deltaY) >= LOCK_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX);
      willCancelRef.current = canceling;
      willLockRef.current = locking && !canceling;
    },
    [isRecording, isLocked],
  );

  const sendRecording = useCallback(async () => {
    const result = await stop();
    setIsLocked(false);
    resetDrag();
    if (result) {
      haptics.light();
      await onRecorded(result);
    }
  }, [stop, onRecorded, resetDrag]);

  const finish = useCallback(async () => {
    if (isLocked) return;
    if (startXRef.current === null) return;

    if (willLockRef.current) {
      setIsLocked(true);
      resetDrag();
      haptics.light();
      return;
    }

    if (willCancelRef.current) {
      cancel();
      resetDrag();
      haptics.light();
      return;
    }

    resetDrag();
    await sendRecording();
  }, [isLocked, cancel, resetDrag, sendRecording]);

  const handlePointerUp = useCallback(() => {
    void finish();
  }, [finish]);

  const handlePointerCancel = useCallback(() => {
    if (isLocked) return;
    if (startXRef.current === null) return;
    resetDrag();
    cancel();
  }, [cancel, isLocked, resetDrag]);

  const handleLockedCancel = useCallback(() => {
    cancel();
    setIsLocked(false);
    resetDrag();
    haptics.light();
  }, [cancel, resetDrag]);

  const handleLockedSend = useCallback(() => {
    void sendRecording();
  }, [sendRecording]);

  useEffect(() => {
    return () => {
      if (isRecording) cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported) return null;

  const active = isRecording || isPreparing || isLocked;
  const willCancel = willCancelRef.current;
  const willLock = willLockRef.current;

  return (
    <div className="relative flex items-center">
      {active && (
        <div
          className={cn(
            'absolute right-full mr-2 flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap',
            'bg-card/95 border border-border/60 backdrop-blur-md shadow-sm',
            willCancel && 'border-destructive/60 text-destructive',
            willLock && 'border-primary/60 text-primary',
            isLocked && 'pointer-events-auto',
            !isLocked && 'pointer-events-none',
          )}
          style={{
            transform: isLocked
              ? undefined
              : `translate(${dragX}px, ${dragY}px)`,
          }}
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
          {isLocked ? (
            <div className="flex items-center gap-1.5">
              <Lock size={12} className="text-primary" />
              <button
                type="button"
                onClick={handleLockedCancel}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                aria-label="Cancel recording"
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleLockedSend}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-primary hover:bg-primary/10"
                aria-label="Send voice note"
              >
                <Send size={14} />
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {willCancel ? (
                <>
                  <Trash2 size={10} /> Release to cancel
                </>
              ) : willLock ? (
                <>
                  <Lock size={10} /> Release to lock
                </>
              ) : (
                <>‹ Cancel · ↑ Lock</>
              )}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={isLocked ? undefined : handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-label={
          isLocked
            ? 'Recording locked — tap send or cancel'
            : active
              ? 'Recording — release to send, slide left to cancel, slide up to lock'
              : 'Hold to record voice note'
        }
        aria-pressed={active}
        disabled={disabled || isLocked}
        className={cn(
          buttonClassName,
          active && 'ring-2 ring-destructive/60 scale-110',
          isLocked && 'ring-primary/60',
          'transition-transform',
        )}
      >
        {isLocked ? <Lock className={iconClassName} /> : <Mic className={iconClassName} />}
      </button>
    </div>
  );
};
