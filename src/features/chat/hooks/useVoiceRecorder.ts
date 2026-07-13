import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * MediaRecorder-based voice note recorder.
 * Samples amplitudes via AnalyserNode so we can render an iMessage-style
 * waveform on the bubble without any extra dependency.
 */
export interface VoiceRecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Normalised 0..1 amplitude samples, ~32 buckets. */
  waveform: number[];
}

export interface UseVoiceRecorderState {
  isSupported: boolean;
  isRecording: boolean;
  isPreparing: boolean;
  elapsedMs: number;
  /** Live amplitude 0..1 (for the recording pill pulse). */
  liveLevel: number;
  error: string | null;
  start: () => Promise<void>;
  /** Stop and return the recording. Returns null if canceled or empty. */
  stop: () => Promise<VoiceRecordingResult | null>;
  cancel: () => void;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return '';
}

export function useVoiceRecorder(maxDurationMs = 5 * 60 * 1000): UseVoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const waveformRef = useRef<number[]>([]);
  const cancelRef = useRef(false);
  const resolveRef = useRef<((r: VoiceRecordingResult | null) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickMimeType() !== '';

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    setLiveLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!isSupported || isRecording || isPreparing) return;
    setError(null);
    setIsPreparing(true);
    cancelRef.current = false;
    waveformRef.current = [];
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const durationMs = Date.now() - startTsRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const waveform = waveformRef.current.slice();
        const canceled = cancelRef.current;
        cleanup();
        setIsRecording(false);
        setElapsedMs(0);
        const resolver = resolveRef.current;
        resolveRef.current = null;
        if (!resolver) return;
        if (canceled || blob.size === 0 || durationMs < 300) {
          resolver(null);
        } else {
          resolver({ blob, mimeType: blob.type, durationMs, waveform });
        }
      };

      // Waveform sampling
      const AudioCtx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSampleAt = 0;
      const tick = (t: number) => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLiveLevel(Math.min(1, rms * 2.5));
        // Sample roughly every 120ms into the persisted waveform (cap ~64 buckets)
        if (t - lastSampleAt > 120 && waveformRef.current.length < 64) {
          waveformRef.current.push(Math.min(1, rms * 2.5));
          lastSampleAt = t;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      startTsRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      setIsPreparing(false);
      setElapsedMs(0);

      timerRef.current = setInterval(() => {
        const el = Date.now() - startTsRef.current;
        setElapsedMs(el);
        if (el >= maxDurationMs) {
          // Auto-stop at max duration — resolves via onstop
          try {
            recorder.stop();
          } catch {
            // ignore
          }
        }
      }, 100);
    } catch (e) {
      cleanup();
      setIsPreparing(false);
      setIsRecording(false);
      setError(e instanceof Error ? e.message : 'Microphone access denied');
    }
  }, [cleanup, isPreparing, isRecording, isSupported, maxDurationMs]);

  const stop = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      cleanup();
      setIsRecording(false);
      return null;
    }
    return new Promise<VoiceRecordingResult | null>(resolve => {
      resolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        resolve(null);
        resolveRef.current = null;
      }
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    } else {
      cleanup();
      setIsRecording(false);
      setElapsedMs(0);
    }
  }, [cleanup]);

  return {
    isSupported,
    isRecording,
    isPreparing,
    elapsedMs,
    liveLevel,
    error,
    start,
    stop,
    cancel,
  };
}
