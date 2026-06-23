/**
 * useConciergeReadAloud — React hook for concierge text-to-speech playback.
 *
 * Splits text into sentences, fetches audio for the first sentence immediately,
 * and pre-fetches subsequent sentences for gapless playback.
 * Caches auth token to reduce latency. Shorter first chunk for faster time-to-voice.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  supabase,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_ANON_KEY,
} from '@/integrations/supabase/client';
import {
  useConciergeVoicePreference,
  DEFAULT_CONCIERGE_VOICE,
} from '@/features/concierge/hooks/useConciergeVoicePreference';
import { streamPcmSpeech } from '@/features/concierge/lib/streamConciergeTts';

export type TTSPlaybackState = 'idle' | 'loading' | 'playing' | 'error';

const RETRYABLE_FETCH_ERROR = 'Failed to fetch';
const TTS_URL = `${SUPABASE_PROJECT_URL}/functions/v1/concierge-voice-tts`;

const toReadablePlaybackError = (err: unknown): string => {
  if (!(err instanceof Error)) return 'TTS playback failed';
  if (err.message === RETRYABLE_FETCH_ERROR) {
    return 'Unable to reach the voice service. Check your connection and try again.';
  }
  return err.message || 'TTS playback failed';
};

/**
 * Split text into sentences for chunked TTS.
 * First chunk is kept short (~80 chars / 1 sentence) for fast time-to-voice.
 * Subsequent chunks can be larger (2-3 sentences) since they pre-fetch during playback.
 */
function splitIntoSentences(text: string): string[] {
  const raw = text.match(/[^.!?]*[.!?]+[\s]*/g);
  if (!raw) return [text.trim()].filter(Boolean);

  const sentences: string[] = [];
  let buffer = '';
  let isFirst = true;

  for (const segment of raw) {
    buffer += segment;
    const maxLen = isFirst ? 80 : 200;
    const maxSentences = isFirst ? 1 : 3;

    if (
      buffer.trim().length >= maxLen ||
      (!isFirst && buffer.split(/[.!?]+/).length > maxSentences)
    ) {
      sentences.push(buffer.trim());
      buffer = '';
      isFirst = false;
    } else if (isFirst && buffer.trim().length >= 20) {
      // For first chunk, split as soon as we have a complete sentence >= 20 chars
      sentences.push(buffer.trim());
      buffer = '';
      isFirst = false;
    }
  }

  // Capture any remaining text
  const remaining = text.slice(raw.join('').length).trim();
  if (remaining) buffer += ' ' + remaining;
  if (buffer.trim()) {
    if (sentences.length > 0 && buffer.trim().length < 20) {
      sentences[sentences.length - 1] += ' ' + buffer.trim();
    } else {
      sentences.push(buffer.trim());
    }
  }

  return sentences.length > 0 ? sentences : [text.trim()].filter(Boolean);
}

interface UseConciergeReadAloudOptions {
  voiceId?: string;
  tripId?: string;
}

interface UseConciergeReadAloudReturn {
  playbackState: TTSPlaybackState;
  playingMessageId: string | null;
  errorMessage: string | null;
  usedFallbackVoice: boolean;
  play: (messageId: string, speechText: string) => Promise<void>;
  stop: () => void;
}

/** Fetch a single sentence's audio as a blob URL. */
async function fetchSentenceAudio(
  sentence: string,
  voiceId: string,
  accessToken: string,
  signal: AbortSignal,
  tripId?: string,
  messageId?: string,
): Promise<{ blobUrl: string; usedFallback: boolean }> {
  const body = {
    text: sentence,
    voice: voiceId,
    format: 'mp3',
    tripId,
    messageId,
  };

  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLIC_ANON_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errMsg = 'TTS request failed';
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // Use default
    }
    throw new Error(errMsg);
  }

  const usedFallback = response.headers.get('x-voice-fallback') === 'true';
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('audio/')) {
    throw new Error('Voice service returned an unexpected response format');
  }

  const blob = await response.blob();
  return { blobUrl: URL.createObjectURL(blob), usedFallback };
}

export function useConciergeReadAloud(
  options: UseConciergeReadAloudOptions = {},
): UseConciergeReadAloudReturn {
  const { voiceId: voiceIdProp, tripId } = options;
  const { voice: preferredVoice } = useConciergeVoicePreference();

  const [playbackState, setPlaybackState] = useState<TTSPlaybackState>('idle');
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedFallbackVoice, setUsedFallbackVoice] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Cache auth token to avoid repeated getSession() calls (~100-200ms each)
  const cachedTokenRef = useRef<string | null>(null);

  // Warm the token cache on mount and auth changes
  useEffect(() => {
    const warmToken = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        cachedTokenRef.current = session?.access_token || null;
      } catch {
        cachedTokenRef.current = null;
      }
    };
    warmToken();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      cachedTokenRef.current = session?.access_token || null;
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cleanup();
    setErrorMessage(null);
    setPlaybackState('idle');
    setPlayingMessageId(null);
    setUsedFallbackVoice(false);
  }, [cleanup]);

  const play = useCallback(
    async (messageId: string, speechText: string) => {
      stop();

      if (!speechText.trim()) {
        setErrorMessage('Nothing to speak');
        setPlaybackState('error');
        return;
      }

      setPlaybackState('loading');
      setPlayingMessageId(messageId);
      setErrorMessage(null);
      setUsedFallbackVoice(false);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        // Use cached token; only fetch if missing
        let accessToken = cachedTokenRef.current;
        if (!accessToken) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          accessToken = session?.access_token || null;
          cachedTokenRef.current = accessToken;
        }
        if (!accessToken) {
          throw new Error('Not authenticated. Please sign in to use voice.');
        }

        const resolvedVoiceId = voiceIdProp || preferredVoice || DEFAULT_CONCIERGE_VOICE;
        const sentences = splitIntoSentences(speechText);

        // Attempt SSE PCM streaming for the FIRST sentence so playback can
        // begin while the audio is still being generated. On any failure we
        // fall back to the original blob-based first-sentence fetch.
        let firstStreamed = false;
        try {
          const stream = streamPcmSpeech({
            url: TTS_URL,
            accessToken,
            apikey: SUPABASE_PUBLIC_ANON_KEY,
            signal: abortController.signal,
            body: {
              text: sentences[0],
              voice: resolvedVoiceId,
              tripId,
              messageId,
            },
            onPlaybackStart: () => setPlaybackState('playing'),
            onMeta: ({ usedFallbackVoice: fb }) => {
              if (fb) setUsedFallbackVoice(true);
            },
          });
          // Track the streaming stop so the hook's stop() interrupts it.
          const prevAudio = audioRef.current;
          audioRef.current = {
            pause: stream.stop,
            removeAttribute: () => {},
            load: () => {},
          } as unknown as HTMLAudioElement;
          await stream.done;
          audioRef.current = prevAudio;
          firstStreamed = true;
        } catch (streamErr) {
          if (abortController.signal.aborted) return;
          console.warn('[concierge-tts] streaming first chunk failed; falling back', streamErr);
        }

        // Fire first AND second sentence fetches in parallel for overlap
        const firstPromise = firstStreamed
          ? null
          : fetchSentenceAudio(
              sentences[0],
              resolvedVoiceId,
              accessToken,
              abortController.signal,
              tripId,
              messageId,
            );

        // Start pre-fetching sentence 2 immediately (overlaps with sentence 1 fetch)
        const secondPromise =
          sentences.length > 1
            ? fetchSentenceAudio(
                sentences[1],
                resolvedVoiceId,
                accessToken,
                abortController.signal,
                tripId,
                messageId,
              ).catch(() => null)
            : null;

        // Pre-fetch remaining sentences (3+) in parallel
        const remainingPromises: Promise<{ blobUrl: string; usedFallback: boolean } | null>[] = [];
        for (let i = 2; i < sentences.length; i++) {
          remainingPromises.push(
            fetchSentenceAudio(
              sentences[i],
              resolvedVoiceId,
              accessToken,
              abortController.signal,
              tripId,
              messageId,
            ).catch(() => null),
          );
        }

        // Wait for first sentence (skipped when SSE streaming already played it)
        if (firstPromise) {
          const first = await firstPromise;
          if (abortController.signal.aborted) return;

          blobUrlsRef.current.push(first.blobUrl);
          if (first.usedFallback) setUsedFallbackVoice(true);

          // Play a sentence and wait for it to finish
          const playAudio = async (blobUrl: string, index: number) => {
            if (abortController.signal.aborted) return;
            const audio = new Audio(blobUrl);
            audioRef.current = audio;
            return new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error('Audio playback failed'));
              if (index === 0) setPlaybackState('playing');
              audio.play().catch(reject);
            });
          };

          // Play first sentence immediately
          await playAudio(first.blobUrl, 0);
          if (abortController.signal.aborted) return;
        }

        // Helper for non-first sentences.
        const playAudio = async (blobUrl: string, index: number) => {
          if (abortController.signal.aborted) return;
          const audio = new Audio(blobUrl);
          audioRef.current = audio;
          return new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error('Audio playback failed'));
            if (index === 0) setPlaybackState('playing');
            audio.play().catch(reject);
          });
        };

        // Play second sentence (already fetching in parallel)
        if (secondPromise) {
          const second = await secondPromise;
          if (second && !abortController.signal.aborted) {
            blobUrlsRef.current.push(second.blobUrl);
            if (second.usedFallback) setUsedFallbackVoice(true);
            await playAudio(second.blobUrl, 1);
          }
        }

        // Play remaining sentences sequentially
        for (let i = 0; i < remainingPromises.length; i++) {
          if (abortController.signal.aborted) return;
          const result = await remainingPromises[i];
          if (!result || abortController.signal.aborted) continue;
          blobUrlsRef.current.push(result.blobUrl);
          if (result.usedFallback) setUsedFallbackVoice(true);
          await playAudio(result.blobUrl, i + 2);
        }

        // All sentences played
        if (!abortController.signal.aborted) {
          cleanup();
          setPlaybackState('idle');
          setPlayingMessageId(null);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        const msg = toReadablePlaybackError(err);
        setErrorMessage(msg);
        setPlaybackState('error');
        setPlayingMessageId(null);
        cleanup();
      }
    },
    [voiceIdProp, preferredVoice, tripId, stop, cleanup],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanup();
    };
  }, [cleanup]);

  return {
    playbackState,
    playingMessageId,
    errorMessage,
    usedFallbackVoice,
    play,
    stop,
  };
}
