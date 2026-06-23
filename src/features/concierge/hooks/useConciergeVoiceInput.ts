/**
 * useConciergeVoiceInput — MVP voice input for AI Concierge.
 *
 * Flow: tap → request mic → MediaRecorder → stop → POST to `concierge-stt`
 * edge function → emit transcript through `onTranscript` callback.
 *
 * The transcript is appended to the concierge input field so the existing
 * typed send handler stays the single source of truth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { VoiceState } from '@/hooks/useWebSpeechVoice';

type InternalState = 'idle' | 'recording' | 'transcribing' | 'error';

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];

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
    typeof MediaRecorder !== 'undefined'
  );
}

const STATE_MAP: Record<InternalState, VoiceState> = {
  idle: 'idle',
  recording: 'listening',
  transcribing: 'thinking',
  error: 'error',
};

interface Options {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

export function useConciergeVoiceInput({ onTranscript, onError }: Options) {
  const [state, setState] = useState<InternalState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const abortRef = useRef<AbortController | null>(null);
  const errorResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const flashError = useCallback(
    (message: string) => {
      cleanupStream();
      setState('error');
      onError?.(message);
      if (errorResetRef.current) clearTimeout(errorResetRef.current);
      errorResetRef.current = setTimeout(() => setState('idle'), 2500);
    },
    [cleanupStream, onError],
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      const form = new FormData();
      const ext = mimeRef.current.includes('mp4')
        ? 'mp4'
        : mimeRef.current.includes('mpeg')
          ? 'mp3'
          : 'webm';
      form.append('audio', blob, `recording.${ext}`);
      form.append('mimeType', mimeRef.current);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data, error } = await supabase.functions.invoke<{
          transcript?: string;
          error?: string;
        }>('concierge-stt', { body: form });

        if (controller.signal.aborted) return;

        if (error) {
          // supabase.functions.invoke wraps non-2xx; surface the message
          const msg =
            (error as unknown as { message?: string })?.message ??
            'Transcription failed. Try again.';
          flashError(msg);
          return;
        }
        if (data?.error) {
          flashError(data.error);
          return;
        }
        const transcript = data?.transcript?.trim();
        if (!transcript) {
          flashError("Didn't catch that — try again.");
          return;
        }

        onTranscript(transcript);
        setState('idle');
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[useConciergeVoiceInput] transcription error', err);
        flashError('Transcription failed. Try again.');
      } finally {
        abortRef.current = null;
        cleanupStream();
      }
    },
    [cleanupStream, flashError, onTranscript],
  );

  const startRecording = useCallback(async () => {
    if (!isSupported()) {
      flashError('Voice input is not supported in this browser.');
      return;
    }
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
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];
        if (blob.size < 1024) {
          flashError("Didn't catch that — try again.");
          return;
        }
        void transcribe(blob);
      };
      recorder.onerror = ev => {
        console.error('[useConciergeVoiceInput] recorder error', ev);
        flashError('Recording failed.');
      };

      recorder.start();
      setState('recording');
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        flashError('Microphone permission denied.');
      } else if (name === 'NotFoundError') {
        flashError('No microphone found.');
      } else {
        console.error('[useConciergeVoiceInput] getUserMedia failed', err);
        flashError('Could not access microphone.');
      }
    }
  }, [flashError, transcribe]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch (err) {
        console.warn('[useConciergeVoiceInput] stop failed', err);
        cleanupStream();
        setState('idle');
      }
    } else {
      cleanupStream();
      setState('idle');
    }
  }, [cleanupStream]);

  const toggleVoice = useCallback(() => {
    if (state === 'recording') {
      stopRecording();
      return;
    }
    if (state === 'transcribing') return; // guard double-tap during upload
    if (state === 'error') {
      setState('idle');
    }
    void startRecording();
  }, [state, startRecording, stopRecording]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (errorResetRef.current) clearTimeout(errorResetRef.current);
      abortRef.current?.abort();
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    voiceState: STATE_MAP[state],
    toggleVoice,
    isSupported: isSupported(),
  };
}
