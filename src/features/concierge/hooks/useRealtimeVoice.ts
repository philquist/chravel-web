/**
 * useRealtimeVoice — bidirectional realtime voice for the AI Concierge.
 *
 * Wraps AI SDK 7's `useRealtime` (@ai-sdk/react) over the Vercel AI Gateway with
 * OpenAI Realtime. A single model hears and speaks directly (true barge-in, low
 * latency) — no STT→LLM→TTS chain. Tool calls the model emits are routed through
 * `execute-concierge-tool`, the same secured path the text concierge uses, so every
 * concierge tool (calendar, tasks, payments, …) keeps working unchanged.
 *
 * SDK contract (verified against node_modules/ai): `api.token` is NOT a token — it is
 * the URL the SDK POSTs to on connect() with `{ sessionConfig }` (and no auth header),
 * expecting `{ token, url, tools }` back. That "setup endpoint" is our Supabase
 * `mint-realtime-token` function, which mints a short-lived AI Gateway client secret
 * (provider key stays server-side), returns the WS url, and ships the concierge tools.
 * The user's chosen voice + trip-aware instructions come from `sessionConfig` (loaded
 * from `realtime-voice-session`) and are applied via the `session-update` the SDK sends
 * on socket open.
 *
 * Lifecycle: start(tripId) → mic permission → build setup URL + load session config (in
 * parallel) → connect → capture audio. If the socket drops mid-session we transparently
 * reconnect (re-mints via the same setup URL; the store is not recreated so the
 * transcript survives). stop() / unmount tears everything down.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { gateway } from 'ai';
import {
  DEFAULT_REALTIME_VOICE_MODEL,
  buildRealtimeSetupUrl,
  executeRealtimeTool,
  fetchRealtimeSessionConfig,
  preflightRealtimeSetup,
  type RealtimeSessionConfigResponse,
} from '../lib/realtimeVoiceClient';
import { useRealtimeDictationCaptions } from './useRealtimeDictationCaptions';

export type RealtimeVoicePhase = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

/**
 * Microphone permission as reported by the Permissions API (where available) and refined
 * by the actual getUserMedia result. 'unknown' means we could not determine it (e.g. Safari
 * doesn't expose `microphone` to the Permissions API) — treat it as "not yet blocked".
 */
export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface RealtimeTranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface UseRealtimeVoiceResult {
  phase: RealtimeVoicePhase;
  isActive: boolean;
  isCapturing: boolean;
  isPlaying: boolean;
  errorMessage: string | null;
  /** Live microphone permission state, for a clear "mic blocked" affordance. */
  micPermission: MicPermissionState;
  /**
   * True while the session is connected and the mic should be capturing. Lets the UI show
   * a distinct "capturing" indicator (vs. connected-but-not-capturing) so a silently failing
   * mic is visible rather than looking like an idle "Listening" state.
   */
  isRecording: boolean;
  /** Full ordered transcript (user + assistant) for rendering above/below the line. */
  turns: RealtimeTranscriptTurn[];
  latestUserText: string;
  latestAssistantText: string;
  start: (tripId: string) => Promise<void>;
  stop: () => void;
}

/**
 * Concatenate the text of a UIMessage's parts. OpenAI Realtime (via AI SDK v7
 * `useRealtime`) surfaces spoken content through several shapes depending on
 * whether it's a finalized text part, an assistant audio transcript, an
 * incremental delta, or a user input transcription — all can appear on the
 * same message. Read every one that carries a string so nothing silently
 * disappears from the transcript.
 */
const _loggedUnknownPartTypes = new Set<string>();
function extractMessageText(message: { parts?: unknown }): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map(part => {
      if (!part || typeof part !== 'object') return '';
      const p = part as Record<string, unknown>;
      // Finalized text part.
      if (typeof p.text === 'string') return p.text;
      // Assistant audio transcript part.
      if (typeof p.transcript === 'string') return p.transcript;
      // User input audio transcription part.
      if (typeof p.input_transcript === 'string') return p.input_transcript as string;
      // Streaming delta (transcript.delta / text.delta / audio-transcript.delta).
      if (typeof p.delta === 'string') return p.delta;
      // Dev-only diagnostic so a future SDK shape change doesn't silently blank the UI.
      if (import.meta.env.DEV) {
        const t = typeof p.type === 'string' ? (p.type as string) : 'unknown';
        if (!_loggedUnknownPartTypes.has(t)) {
          _loggedUnknownPartTypes.add(t);
          console.debug('[realtime-voice] unknown message part type', t, p);
        }
      }
      return '';
    })
    .join('')
    .trim();
}

function errorToMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Microphone access was denied. Enable it to use voice.';
  }
  return err instanceof Error ? err.message : 'Voice session error.';
}

// If the socket drops while the user still intends to talk, re-mint + reconnect a few
// times with backoff before giving up. Bounded so a persistent failure can't loop.
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000];

export function useRealtimeVoice(): UseRealtimeVoiceResult {
  // The SDK's `api.token` is the setup-endpoint URL it POSTs to on connect(); it mints
  // a fresh client secret each call, so the same URL is reused for reconnects.
  const [setupUrl, setSetupUrl] = useState('');
  const [sessionConfig, setSessionConfig] = useState<RealtimeSessionConfigResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionState>('unknown');

  // Live word-by-word captions of what the user is saying (the realtime SDK only delivers
  // the user's transcript once the utterance finishes, so this fills the gap while speaking).
  // Destructure the stable callbacks up front: the hook returns a fresh object every render
  // (its caption/listening state changes constantly), so anything depending on `captions`
  // itself would be recreated each render — including `stop`, whose reference is used as the
  // unmount effect's cleanup, which would then tear the session down on every re-render.
  const captions = useRealtimeDictationCaptions();
  const captionsStart = captions.start;
  const captionsStop = captions.stop;
  const captionsReset = captions.reset;

  const tripIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingConnectRef = useRef(false);
  const startingRef = useRef(false);

  // Reconnect bookkeeping (transparent recovery from a dropped socket).
  const intendActiveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The realtime model object is pure on the client (getWebSocketConfig / parse /
  // serialize); the ephemeral client secret carries auth. Create it once.
  const model = useMemo(() => gateway.experimental_realtime(DEFAULT_REALTIME_VOICE_MODEL), []);

  // Probe the microphone permission up front (where the Permissions API supports it) and
  // keep it live, so the overlay can show a clear "mic blocked" state before/without having
  // to hit a getUserMedia failure. Safari doesn't expose `microphone` here — that rejects
  // and we simply stay 'unknown' until start() resolves it from the getUserMedia result.
  useEffect(() => {
    const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const handleChange = () => {
      if (status) setMicPermission(status.state as MicPermissionState);
    };
    permissions
      .query({ name: 'microphone' as PermissionName })
      .then(result => {
        if (cancelled) return;
        status = result;
        setMicPermission(result.state as MicPermissionState);
        result.addEventListener('change', handleChange);
      })
      .catch(() => {
        /* Permissions API doesn't support `microphone` here (e.g. Safari) — stay 'unknown'. */
      });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', handleChange);
    };
  }, []);

  const onToolCall = useCallback(
    async ({ toolCall }: { toolCall: { toolCallId: string; toolName: string; args: unknown } }) => {
      const tripId = tripIdRef.current;
      if (!tripId) return { success: false, error: 'No active trip context.' };
      let args: Record<string, unknown> = {};
      if (typeof toolCall.args === 'string') {
        try {
          args = JSON.parse(toolCall.args) as Record<string, unknown>;
        } catch {
          args = {};
        }
      } else if (toolCall.args && typeof toolCall.args === 'object') {
        args = toolCall.args as Record<string, unknown>;
      }
      // Pass the stable tool-call id so retries of the same call are idempotent.
      return executeRealtimeTool(tripId, toolCall.toolName, args, toolCall.toolCallId);
    },
    [],
  );

  const onError = useCallback((err: Error) => {
    setErrorMessage(errorToMessage(err));
  }, []);

  const realtimeSessionConfig = useMemo(() => {
    if (!sessionConfig) return undefined;
    return {
      instructions: sessionConfig.instructions,
      voice: sessionConfig.voice,
      tools: sessionConfig.tools,
      outputModalities: ['audio', 'text'] as Array<'text' | 'audio'>,
      // OpenAI semantic VAD: model decides turn boundaries → natural barge-in.
      turnDetection: { type: 'semantic-vad' as const },
      // Surface the user's words as text so they can be read below the line.
      inputAudioTranscription: { model: 'gpt-4o-mini-transcribe' },
    };
  }, [sessionConfig]);

  const realtime = useRealtime({
    model,
    api: { token: setupUrl },
    sessionConfig: realtimeSessionConfig,
    onToolCall,
    onError,
  });

  // Keep a stable ref so start/stop don't depend on the per-render hook object.
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Open the socket on the current store, then attach the live mic. `connect()` catches
  // its own errors (it calls onError + sets status 'error') and never throws, so we gate
  // audio capture on the resulting status rather than a try/catch.
  const openConnection = useCallback(async () => {
    await realtimeRef.current.connect();
    if (realtimeRef.current.status === 'error') return false;
    if (streamRef.current) {
      realtimeRef.current.startAudioCapture(streamRef.current);
    }
    return true;
  }, []);

  // Connect once both the setup URL and session config are in state (start() sets the
  // pending flag so this only fires for a genuine start, not incidental re-renders).
  useEffect(() => {
    if (!pendingConnectRef.current) return;
    if (!setupUrl || !sessionConfig) return;
    pendingConnectRef.current = false;
    let cancelled = false;
    void (async () => {
      try {
        await openConnection();
      } finally {
        if (!cancelled) {
          setStarting(false);
          startingRef.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setupUrl, sessionConfig, openConnection]);

  // Transparent reconnect: if the socket closes while the user still intends to talk,
  // re-mint via the same setup URL and reconnect (the store is not recreated, so the
  // transcript survives). Bounded with backoff so a hard failure can't loop forever.
  useEffect(() => {
    if (realtime.status === 'connected') {
      reconnectAttemptsRef.current = 0; // healthy again → reset the budget
      return;
    }
    if (realtime.status !== 'disconnected') return; // 'connecting'/'error' handled elsewhere
    if (!intendActiveRef.current) return; // user stopped, or never started
    if (pendingConnectRef.current) return; // initial connect still in flight
    if (reconnectTimerRef.current) return; // a reconnect is already scheduled
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      intendActiveRef.current = false;
      setErrorMessage('Voice session disconnected. Tap the wave to start again.');
      return;
    }
    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current = attempt + 1;
    const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!intendActiveRef.current) return;
      void openConnection();
    }, delay);
  }, [realtime.status, openConnection]);

  const start = useCallback(
    async (tripId: string) => {
      if (startingRef.current) return;
      const status = realtimeRef.current.status;
      if (status === 'connecting' || status === 'connected') return;
      startingRef.current = true;
      setStarting(true);
      setErrorMessage(null);
      clearReconnectTimer();
      reconnectAttemptsRef.current = 0;
      try {
        // Mic first: prompts permission and satisfies the iOS user-gesture requirement
        // for audio playback before we open the socket. Guard `mediaDevices` explicitly:
        // on http (non-localhost) or older Android WebViews it is undefined and the raw
        // TypeError is illegible to users.
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error(
            'Your browser does not expose a microphone here. Try Safari or Chrome over HTTPS.',
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermission('granted');
        streamRef.current = stream;
        tripIdRef.current = tripId;
        // Setup URL (auth + model) and session config (voice + instructions + tools) are
        // independent — fetch them together, then hand both to the store to trigger connect.
        const [url, config] = await Promise.all([
          buildRealtimeSetupUrl(),
          fetchRealtimeSessionConfig(tripId),
        ]);
        if (!url) {
          throw new Error('Could not start the voice session. Please try again.');
        }
        // Dry-run the setup endpoint now: the SDK swallows error bodies, so this is the
        // only place a misconfiguration (gateway key, model, credits) surfaces legibly.
        await preflightRealtimeSetup(url, {
          instructions: config.instructions,
          voice: config.voice,
          tools: config.tools,
        });
        intendActiveRef.current = true;
        pendingConnectRef.current = true;
        setSetupUrl(url);
        setSessionConfig(config);
      } catch (err) {
        intendActiveRef.current = false;
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setMicPermission('denied');
        }
        cleanupStream();
        tripIdRef.current = null;
        setErrorMessage(errorToMessage(err));
        setStarting(false);
        startingRef.current = false;
      }
    },
    [cleanupStream, clearReconnectTimer],
  );

  const stop = useCallback(() => {
    intendActiveRef.current = false;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    try {
      realtimeRef.current.stopAudioCapture();
    } catch {
      /* already stopped */
    }
    try {
      realtimeRef.current.disconnect();
    } catch {
      /* already disconnected */
    }
    cleanupStream();
    captionsStop();
    captionsReset();
    pendingConnectRef.current = false;
    startingRef.current = false;
    setStarting(false);
    setSetupUrl('');
    setSessionConfig(null);
    // Clear the error too, or phase stays 'error' (errorMessage set) and the overlay
    // can never be dismissed after a failed start.
    setErrorMessage(null);
    tripIdRef.current = null;
  }, [cleanupStream, clearReconnectTimer, captionsStop, captionsReset]);

  // Tear down on unmount only. Do NOT depend on `stop` identity — caption helpers
  // can change `stop`'s reference across renders, and re-running this effect would
  // abort a freshly started session (waveform tap appears to do nothing).
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    return () => {
      stopRef.current();
    };
  }, []);

  const phase: RealtimeVoicePhase = useMemo(() => {
    if (starting) return 'connecting';
    switch (realtime.status) {
      case 'connecting':
        return 'connecting';
      case 'connected':
        // A live/reconnected session always shows its real state — never latch to
        // 'error' from a stale errorMessage (e.g. a transient WS blip we recovered from).
        return realtime.isPlaying ? 'speaking' : 'listening';
      case 'error':
        return 'error';
      default:
        // 'disconnected': a failed start leaves the store disconnected but sets
        // errorMessage. Surface it as 'error' (keeps the overlay mounted to show the
        // reason) instead of 'idle' (which would unmount and swallow it — the
        // "flash and vanish" bug). A live reconnect is 'connecting'/'connected', not here.
        return errorMessage ? 'error' : 'idle';
    }
  }, [starting, errorMessage, realtime.status, realtime.isPlaying]);

  const turns: RealtimeTranscriptTurn[] = useMemo(() => {
    return realtime.messages
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        text: extractMessageText(message),
      }))
      .filter(turn => turn.text.length > 0);
  }, [realtime.messages]);

  const committedUserText = useMemo(
    () => [...turns].reverse().find(turn => turn.role === 'user')?.text ?? '',
    [turns],
  );
  const latestAssistantText = useMemo(
    () => [...turns].reverse().find(turn => turn.role === 'assistant')?.text ?? '',
    [turns],
  );

  // Prefer the live caption (word-by-word, updates as you speak) over the committed turn,
  // but only while the assistant is NOT speaking: during playback the mic can pick up the
  // assistant's own voice from the speakers, which the caption recognizer would otherwise
  // render as if the user said it. When the authoritative transcript lands we reset the
  // caption (below), so this cleanly falls back to the committed text between utterances.
  const latestUserText = (!realtime.isPlaying && captions.caption) || committedUserText;

  // Run live captions only while the socket is actually connected.
  useEffect(() => {
    if (realtime.status === 'connected') captionsStart();
    else captionsStop();
  }, [realtime.status, captionsStart, captionsStop]);

  // When the realtime session commits a new user turn, clear the live caption so the next
  // utterance starts fresh (and we don't show the previous sentence stacked on the new one).
  const committedUserTurnCount = useMemo(
    () => turns.filter(turn => turn.role === 'user').length,
    [turns],
  );
  const prevCommittedUserTurnCountRef = useRef(0);
  useEffect(() => {
    if (committedUserTurnCount > prevCommittedUserTurnCountRef.current) {
      prevCommittedUserTurnCountRef.current = committedUserTurnCount;
      captionsReset();
    }
  }, [committedUserTurnCount, captionsReset]);

  // Clear the caption on the *rising* edge of playback (assistant starts speaking), so the
  // just-finished utterance doesn't linger and any echo captured off the speakers starts
  // fresh. We deliberately do NOT reset on the falling edge: a user who barges in while the
  // assistant is talking accumulates words during playback (hidden by the !isPlaying gate
  // below), and those must survive to show the moment the assistant goes quiet.
  const prevIsPlayingRef = useRef(false);
  useEffect(() => {
    if (realtime.isPlaying && !prevIsPlayingRef.current) {
      captionsReset();
    }
    prevIsPlayingRef.current = realtime.isPlaying;
  }, [realtime.isPlaying, captionsReset]);

  const isRecording = realtime.status === 'connected' && realtime.isCapturing;

  return {
    phase,
    isActive: phase !== 'idle',
    isCapturing: realtime.isCapturing,
    isPlaying: realtime.isPlaying,
    errorMessage,
    micPermission,
    isRecording,
    turns,
    latestUserText,
    latestAssistantText,
    start,
    stop,
  };
}
