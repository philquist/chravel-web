/**
 * useRealtimeVoice — bidirectional realtime voice for the AI Concierge.
 *
 * Wraps AI SDK 7's `useRealtime` (@ai-sdk/react) over the Vercel AI Gateway with
 * OpenAI Realtime. A single model hears and speaks directly (true barge-in, low
 * latency) — no STT→LLM→TTS chain. Tool calls the model emits are routed through
 * `execute-concierge-tool`, the same secured path the text concierge uses, so every
 * concierge tool (calendar, tasks, payments, …) keeps working unchanged.
 *
 * Lifecycle: start(tripId) → mic permission → mint token + load session config (in
 * parallel) → connect → capture audio. stop() / unmount tears everything down.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { gateway } from 'ai';
import {
  DEFAULT_REALTIME_VOICE_MODEL,
  executeRealtimeTool,
  fetchRealtimeSessionConfig,
  fetchRealtimeToken,
  type RealtimeSessionConfigResponse,
} from '../lib/realtimeVoiceClient';

export type RealtimeVoicePhase = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

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
  /** Full ordered transcript (user + assistant) for rendering above/below the line. */
  turns: RealtimeTranscriptTurn[];
  latestUserText: string;
  latestAssistantText: string;
  start: (tripId: string) => Promise<void>;
  stop: () => void;
}

/** Concatenate the text of a UIMessage's parts (text + any transcript parts). */
function extractMessageText(message: { parts?: unknown }): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map(part => {
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
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

// Re-mint the ephemeral token this long before it expires and reconnect, so a
// conversation survives past the token's ~10-minute TTL. If the server doesn't
// report an expiry, fall back to a conservative interval under the known TTL.
const TOKEN_REFRESH_LEAD_MS = 60_000;
const DEFAULT_SESSION_REFRESH_MS = 8 * 60 * 1000;

export function useRealtimeVoice(): UseRealtimeVoiceResult {
  const [token, setToken] = useState('');
  const [sessionConfig, setSessionConfig] = useState<RealtimeSessionConfigResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Transcript turns carried over from before a token-refresh reconnect (the new
  // realtime store starts empty), so the on-screen transcript doesn't wipe.
  const [priorTurns, setPriorTurns] = useState<RealtimeTranscriptTurn[]>([]);

  const tripIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingConnectRef = useRef(false);
  const startingRef = useRef(false);

  // Token refresh / reconnect bookkeeping.
  const intendActiveRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const refreshSessionRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const reconnectSeqRef = useRef(0);
  const storeTurnsRef = useRef<RealtimeTranscriptTurn[]>([]);

  // The realtime model object is pure on the client (getWebSocketConfig / parse /
  // serialize); the ephemeral token carries auth. Create it once.
  const model = useMemo(() => gateway.experimental_realtime(DEFAULT_REALTIME_VOICE_MODEL), []);

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
    api: { token },
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

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Arm the next token refresh based on the current token's expiry.
  const scheduleRefresh = useCallback(
    (expiresAtSeconds?: number | null) => {
      clearRefreshTimer();
      const untilLead =
        typeof expiresAtSeconds === 'number'
          ? expiresAtSeconds * 1000 - Date.now() - TOKEN_REFRESH_LEAD_MS
          : DEFAULT_SESSION_REFRESH_MS;
      const delay = Math.max(untilLead, 5_000);
      refreshTimerRef.current = setTimeout(() => {
        void refreshSessionRef.current();
      }, delay);
    },
    [clearRefreshTimer],
  );

  // Re-mint the token and reconnect, reusing the live mic stream, so the session
  // outlives the ephemeral token. Recreating the store loses the model's in-session
  // memory, but the user keeps talking and the transcript is carried over.
  const refreshSession = useCallback(async () => {
    if (!intendActiveRef.current || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const tokenResult = await fetchRealtimeToken();
      if (!intendActiveRef.current) return; // stopped while minting
      if (!tokenResult.token) throw new Error('Empty refresh token');
      // Carry the transcript so far into priorTurns (new store starts empty). Namespace
      // ids by reconnect count so React keys stay unique across store instances.
      reconnectSeqRef.current += 1;
      const seq = reconnectSeqRef.current;
      const carried = storeTurnsRef.current.map(turn => ({ ...turn, id: `r${seq}:${turn.id}` }));
      if (carried.length) setPriorTurns(prev => [...prev, ...carried]);
      expiresAtRef.current = tokenResult.expiresAt ?? null;
      pendingConnectRef.current = true;
      setToken(tokenResult.token); // store recreates → connect effect reconnects + re-attaches mic
      scheduleRefresh(tokenResult.expiresAt);
    } catch {
      // Keep the current session up and retry soon so we still beat expiry.
      if (intendActiveRef.current) {
        clearRefreshTimer();
        refreshTimerRef.current = setTimeout(() => {
          void refreshSessionRef.current();
        }, 15_000);
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [scheduleRefresh, clearRefreshTimer]);
  refreshSessionRef.current = refreshSession;

  // Connect once both the token and session config are in state.
  useEffect(() => {
    if (!pendingConnectRef.current) return;
    if (!token || !sessionConfig) return;
    pendingConnectRef.current = false;
    let cancelled = false;
    void (async () => {
      try {
        await realtimeRef.current.connect();
        if (cancelled) return;
        if (streamRef.current) {
          realtimeRef.current.startAudioCapture(streamRef.current);
        }
      } catch (err) {
        if (!cancelled) setErrorMessage(errorToMessage(err));
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
  }, [token, sessionConfig]);

  const start = useCallback(
    async (tripId: string) => {
      if (startingRef.current) return;
      const status = realtimeRef.current.status;
      if (status === 'connecting' || status === 'connected') return;
      // After a prior failure the store sits in 'error' (not 'disconnected'); reset it
      // so the user can retry without remounting.
      if (status === 'error') {
        try {
          realtimeRef.current.disconnect();
        } catch {
          /* already torn down */
        }
      }
      startingRef.current = true;
      setStarting(true);
      setErrorMessage(null);
      try {
        // Mic first: prompts permission and satisfies the iOS user-gesture
        // requirement for audio playback before we open the socket.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        tripIdRef.current = tripId;
        const [tokenResult, config] = await Promise.all([
          fetchRealtimeToken(),
          fetchRealtimeSessionConfig(tripId),
        ]);
        // Guard against an empty token: otherwise the connect effect bails on its
        // `!token` check and the mic stream would stay live with no session.
        if (!tokenResult.token) {
          throw new Error('Could not start the voice session. Please try again.');
        }
        intendActiveRef.current = true;
        expiresAtRef.current = tokenResult.expiresAt ?? null;
        setPriorTurns([]);
        pendingConnectRef.current = true;
        setToken(tokenResult.token);
        setSessionConfig(config);
        scheduleRefresh(tokenResult.expiresAt);
      } catch (err) {
        intendActiveRef.current = false;
        clearRefreshTimer();
        cleanupStream();
        tripIdRef.current = null;
        setErrorMessage(errorToMessage(err));
        setStarting(false);
        startingRef.current = false;
      }
    },
    [cleanupStream, scheduleRefresh, clearRefreshTimer],
  );

  const stop = useCallback(() => {
    intendActiveRef.current = false;
    clearRefreshTimer();
    expiresAtRef.current = null;
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
    pendingConnectRef.current = false;
    startingRef.current = false;
    setStarting(false);
    setToken('');
    setSessionConfig(null);
    setPriorTurns([]);
    tripIdRef.current = null;
  }, [cleanupStream, clearRefreshTimer]);

  // Tear down on unmount so a stray socket/mic never outlives the screen.
  useEffect(() => stop, [stop]);

  const phase: RealtimeVoicePhase = useMemo(() => {
    if (starting) return 'connecting';
    switch (realtime.status) {
      case 'connecting':
        return 'connecting';
      case 'connected':
        return realtime.isPlaying ? 'speaking' : 'listening';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  }, [starting, realtime.status, realtime.isPlaying]);

  const storeTurns: RealtimeTranscriptTurn[] = useMemo(() => {
    return realtime.messages
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        text: extractMessageText(message),
      }))
      .filter(turn => turn.text.length > 0);
  }, [realtime.messages]);
  // Snapshot for refreshSession to carry forward across a reconnect.
  storeTurnsRef.current = storeTurns;

  // Carried-over turns (pre-reconnect) followed by the current store's turns.
  const turns: RealtimeTranscriptTurn[] = useMemo(
    () => [...priorTurns, ...storeTurns],
    [priorTurns, storeTurns],
  );

  const latestUserText = useMemo(
    () => [...turns].reverse().find(turn => turn.role === 'user')?.text ?? '',
    [turns],
  );
  const latestAssistantText = useMemo(
    () => [...turns].reverse().find(turn => turn.role === 'assistant')?.text ?? '',
    [turns],
  );

  return {
    phase,
    isActive: phase !== 'idle',
    isCapturing: realtime.isCapturing,
    isPlaying: realtime.isPlaying,
    errorMessage,
    turns,
    latestUserText,
    latestAssistantText,
    start,
    stop,
  };
}
