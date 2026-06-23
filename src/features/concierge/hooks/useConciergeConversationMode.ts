/**
 * useConciergeConversationMode — hands-free voice loop for the AI Concierge.
 *
 * Lifecycle per turn:
 *   listening (mic + VAD) → end-of-speech → transcribing (STT)
 *     → sending (handleSendMessage; pipes through normal text path so
 *       quotas / streaming / RAG / tools are unchanged)
 *     → speaking (autoplay TTS of the new assistant message)
 *     → back to listening (if still active).
 *
 * Counted as 1 query per spoken turn — STT and TTS are plumbing, the
 * underlying `handleSendMessage` is what increments the usage meter.
 *
 * VAD is a simple RMS-over-rolling-window detector on an AnalyserNode tap of
 * the same MediaStream feeding MediaRecorder. No external deps.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage } from '@/features/concierge/types';
import type { TTSPlaybackState } from '@/hooks/useConciergeReadAloud';

export type ConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'sending'
  | 'speaking'
  | 'error';

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
];

const SILENCE_RMS_THRESHOLD = 0.012; // empirical; tuned for laptop/phone mics
const SILENCE_HOLD_MS = 1400; // ms of continuous silence to end the turn
const MIN_SPEECH_MS = 400; // require at least this much voiced audio to send
const MAX_TURN_MS = 30_000; // hard cap per turn

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const check = (MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean })
    .isTypeSupported;
  if (!check) return undefined;
  for (const t of PREFERRED_MIME_TYPES) {
    try {
      if (check(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function isSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioContext !== 'undefined'
  );
}

interface Options {
  enabled: boolean;
  messages: ChatMessage[];
  isTyping: boolean;
  handleSendMessage: (override?: string) => Promise<void> | void;
  ttsPlay: (messageId: string, speechText: string) => Promise<void>;
  ttsStop: () => void;
  ttsPlaybackState: TTSPlaybackState;
  buildSpeechText: (msg: ChatMessage) => string;
  onError?: (message: string) => void;
}

interface Result {
  active: boolean;
  state: ConversationState;
  toggle: () => void;
  isSupported: boolean;
  liveTranscript: string;
}

export function useConciergeConversationMode({
  enabled,
  messages,
  isTyping,
  handleSendMessage,
  ttsPlay,
  ttsStop,
  ttsPlaybackState,
  buildSpeechText,
  onError,
}: Options): Result {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<ConversationState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');

  const activeRef = useRef(false);
  activeRef.current = active;
  const stateRef = useRef<ConversationState>('idle');
  stateRef.current = state;

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const turnStartRef = useRef<number>(0);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const lastIndexAtStartRef = useRef<number>(0);

  const supported = isSupported();

  // ── Cleanup helpers ───────────────────────────────────────────────────
  const stopVadLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    silenceStartRef.current = null;
    speechStartRef.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    stopVadLoop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* ignore */
      }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    chunksRef.current = [];
  }, [stopVadLoop]);

  // ── STT call ──────────────────────────────────────────────────────────
  const transcribe = useCallback(
    async (blob: Blob): Promise<string> => {
      const form = new FormData();
      const ext = mimeRef.current.includes('mp4')
        ? 'mp4'
        : mimeRef.current.includes('mpeg')
          ? 'mp3'
          : 'webm';
      form.append('audio', blob, `recording.${ext}`);
      form.append('mimeType', mimeRef.current);

      const { data, error } = await supabase.functions.invoke<{
        transcript?: string;
        error?: string;
      }>('concierge-stt', { body: form });

      if (error) {
        throw new Error((error as { message?: string })?.message ?? 'Transcription failed');
      }
      if (data?.error) throw new Error(data.error);
      return (data?.transcript ?? '').trim();
    },
    [],
  );

  // ── End-of-turn handler ───────────────────────────────────────────────
  const finalizeTurn = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    const blob: Blob = await new Promise(resolve => {
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];
        resolve(b);
      };
      try {
        rec.stop();
      } catch {
        resolve(new Blob());
      }
    });
    releaseMic();

    if (!activeRef.current) return;

    if (blob.size < 1024) {
      // Empty / barely-voiced turn — reopen mic instead of bothering the user.
      if (activeRef.current) void startListening();
      return;
    }

    setState('transcribing');
    let transcript = '';
    try {
      transcript = await transcribe(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      onError?.(msg);
      setState('error');
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) void startListening();
        }, 1200);
      }
      return;
    }

    if (!transcript) {
      if (activeRef.current) void startListening();
      return;
    }

    setLiveTranscript(transcript);
    setState('sending');
    lastIndexAtStartRef.current = messagesRef.current.length;
    try {
      await Promise.resolve(handleSendMessage(transcript));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      onError?.(msg);
      setState('error');
    }
    // The messages/isTyping watcher below picks it up from here and triggers
    // the speaking → listening transition.
  }, [handleSendMessage, onError, releaseMic, transcribe]);

  // ── VAD tick ──────────────────────────────────────────────────────────
  const tickVad = useCallback(() => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);

    // RMS in [0, 1]
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();

    if (rms > SILENCE_RMS_THRESHOLD) {
      if (speechStartRef.current === null) speechStartRef.current = now;
      silenceStartRef.current = null;
    } else if (speechStartRef.current !== null) {
      if (silenceStartRef.current === null) silenceStartRef.current = now;
      const silenceMs = now - silenceStartRef.current;
      const speechMs = (silenceStartRef.current ?? now) - speechStartRef.current;
      if (silenceMs >= SILENCE_HOLD_MS && speechMs >= MIN_SPEECH_MS) {
        stopVadLoop();
        void finalizeTurn();
        return;
      }
    }

    if (now - turnStartRef.current >= MAX_TURN_MS && speechStartRef.current !== null) {
      stopVadLoop();
      void finalizeTurn();
      return;
    }

    rafRef.current = requestAnimationFrame(tickVad);
  }, [finalizeTurn, stopVadLoop]);

  // ── Start mic + recorder + VAD ────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!supported || !activeRef.current) return;
    if (stateRef.current === 'listening') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeRef.current = mimeType ?? 'audio/webm';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        onError?.('Recording failed.');
        setState('error');
        releaseMic();
      };
      recorder.start();

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      turnStartRef.current = performance.now();
      silenceStartRef.current = null;
      speechStartRef.current = null;

      setLiveTranscript('');
      setState('listening');
      rafRef.current = requestAnimationFrame(tickVad);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        onError?.('Microphone permission denied.');
      } else if (name === 'NotFoundError') {
        onError?.('No microphone found.');
      } else {
        onError?.('Could not access microphone.');
      }
      setActive(false);
      setState('idle');
    }
  }, [onError, releaseMic, supported, tickVad]);

  // ── Public toggle ─────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    if (!supported) {
      onError?.('Conversation mode is not supported in this browser.');
      return;
    }
    if (active) {
      setActive(false);
      releaseMic();
      ttsStop();
      setState('idle');
      setLiveTranscript('');
      return;
    }
    setActive(true);
    activeRef.current = true;
    void startListening();
  }, [active, onError, releaseMic, startListening, supported, ttsStop]);

  // ── Watch for assistant reply → speak it → resume mic ────────────────
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    if (!active) return;
    if (stateRef.current !== 'sending') return;
    if (isTyping) return;
    // Find the newest assistant message added after we started sending.
    const newer = messages.slice(lastIndexAtStartRef.current);
    const lastAssistant = [...newer].reverse().find(m => m.type === 'assistant' && m.content);
    if (!lastAssistant || lastAssistant.id === lastSpokenMessageIdRef.current) return;
    lastSpokenMessageIdRef.current = lastAssistant.id;
    const speech = buildSpeechText(lastAssistant);
    if (!speech) {
      // Nothing to say — just reopen the mic.
      if (active) void startListening();
      return;
    }
    setState('speaking');
    void ttsPlay(lastAssistant.id, speech)
      .catch(() => {
        /* error toast surfaced elsewhere */
      })
      .finally(() => {
        if (activeRef.current) void startListening();
        else setState('idle');
      });
  }, [active, buildSpeechText, isTyping, messages, startListening, ttsPlay]);

  // Safety net: if TTS state externally drops to idle while we think we're
  // speaking (e.g. user stopped playback elsewhere), reopen the mic.
  useEffect(() => {
    if (!active) return;
    if (stateRef.current !== 'speaking') return;
    if (ttsPlaybackState === 'idle' || ttsPlaybackState === 'error') {
      // small delay avoids racing the .finally above
      const t = setTimeout(() => {
        if (activeRef.current && stateRef.current === 'speaking') {
          void startListening();
        }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [active, startListening, ttsPlaybackState]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      releaseMic();
    };
  }, [releaseMic]);

  // External disable
  useEffect(() => {
    if (!enabled && active) {
      setActive(false);
      releaseMic();
      ttsStop();
      setState('idle');
    }
  }, [active, enabled, releaseMic, ttsStop]);

  return {
    active,
    state,
    toggle,
    isSupported: supported,
    liveTranscript,
  };
}
