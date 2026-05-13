import { supabase } from '@/integrations/supabase/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GeminiLiveState,
  ToolCallRequest,
  ToolCallResult,
  VoiceConversationTurn,
  VoiceDiagnostics,
} from '@/types/voice';

interface UseOpenAIRealtimeVoiceOptions {
  tripId: string;
  voice?: string;
  onTurnComplete?: (
    userText: string,
    assistantText: string,
    toolResults?: ToolCallResult[],
    turn?: {
      id: string;
      userText: string;
      assistantText: string;
      toolResults: ToolCallResult[];
      createdAt: string;
    },
    acknowledgeTurn?: () => void,
  ) => void;
  onPartialTranscript?: (partial: {
    role: 'user' | 'assistant';
    text: string;
    isFinal: boolean;
  }) => void;
  onError?: (message: string) => void;
  onToolCall?: (call: ToolCallRequest) => Promise<Record<string, unknown>>;
}

interface UseOpenAIRealtimeVoiceReturn {
  state: GeminiLiveState;
  error: string | null;
  userTranscript: string;
  assistantTranscript: string;
  conversationHistory: VoiceConversationTurn[];
  diagnostics: VoiceDiagnostics;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  interruptPlayback: () => void;
  sendImage: (mimeType: string, base64Data: string) => void;
  isSupported: boolean;
  circuitBreakerOpen: boolean;
  resetCircuitBreaker: () => void;
}

function defaultDiagnostics(): VoiceDiagnostics {
  return {
    enabled: true,
    connectionStatus: 'idle',
    audioContextState: 'unavailable',
    audioSampleRate: null,
    inputEncoding: 'pcm16',
    micPermission: 'unknown',
    micDeviceLabel: null,
    micRms: 0,
    playbackRms: 0,
    wsCloseCode: null,
    wsCloseReason: null,
    reconnectAttempts: 0,
    lastError: null,
    substep: null,
    metrics: {
      firstAudioChunkSentMs: null,
      firstTokenReceivedMs: null,
      firstAudioFramePlayedMs: null,
      cancelLatencyMs: null,
    },
  };
}

export function useOpenAIRealtimeVoice(
  options: UseOpenAIRealtimeVoiceOptions,
): UseOpenAIRealtimeVoiceReturn {
  const {
    tripId,
    voice = 'echo',
    onTurnComplete,
    onPartialTranscript,
    onError,
    onToolCall,
  } = options;

  const [state, setState] = useState<GeminiLiveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<VoiceConversationTurn[]>([]);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(defaultDiagnostics);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingToolResultsRef = useRef<ToolCallResult[]>([]);
  const userTranscriptRef = useRef('');
  const assistantTranscriptRef = useRef('');
  const eventQueueRef = useRef<Promise<void>>(Promise.resolve());

  const clearSession = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (audioElRef.current) audioElRef.current.srcObject = null;
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
  }, []);

  const endSession = useCallback(async () => {
    clearSession();
    setState('idle');
    setUserTranscript('');
    setAssistantTranscript('');
    userTranscriptRef.current = '';
    assistantTranscriptRef.current = '';
    pendingToolResultsRef.current = [];
  }, [clearSession]);

  const handleRealtimeEvent = useCallback(
    async (event: Record<string, unknown>) => {
      const type = String(event?.type || '');
      if (!type) return;

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const text = String(event?.transcript || '');
        userTranscriptRef.current = text;
        setUserTranscript(text);
        setConversationHistory(prev => [...prev, { role: 'user', text }]);
        onPartialTranscript?.({ role: 'user', text, isFinal: true });
      }

      if (type === 'response.audio_transcript.delta' || type === 'response.output_text.delta') {
        const delta = String(event?.delta || '');
        if (!delta) return;
        const nextAssistant = `${assistantTranscriptRef.current}${delta}`;
        assistantTranscriptRef.current = nextAssistant;
        setAssistantTranscript(nextAssistant);
        onPartialTranscript?.({ role: 'assistant', text: nextAssistant, isFinal: false });
      }

      if (type === 'response.done') {
        const assistantText = assistantTranscriptRef.current;
        if (assistantText) {
          setConversationHistory(prev => [...prev, { role: 'assistant', text: assistantText }]);
          onPartialTranscript?.({ role: 'assistant', text: assistantText, isFinal: true });
        }
        const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const userTextFinal = userTranscriptRef.current;
        const toolResults = [...pendingToolResultsRef.current];
        onTurnComplete?.(
          userTextFinal,
          assistantText,
          toolResults,
          {
            id: turnId,
            userText: userTextFinal,
            assistantText,
            toolResults,
            createdAt: new Date().toISOString(),
          },
          () => {
            setUserTranscript('');
            setAssistantTranscript('');
            userTranscriptRef.current = '';
            assistantTranscriptRef.current = '';
            pendingToolResultsRef.current = [];
          },
        );
      }

      if (type === 'response.function_call_arguments.done') {
        const callId = String(event?.call_id || event?.id || crypto.randomUUID());
        const name = String(event?.name || '');
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(event?.arguments || '{}'));
        } catch {
          args = {};
        }

        if (!onToolCall || !dcRef.current) return;

        const result = await onToolCall({ id: callId, name, args });
        pendingToolResultsRef.current.push({ name, result });

        dcRef.current.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify(result),
            },
          }),
        );
        dcRef.current.send(JSON.stringify({ type: 'response.create' }));
      }
    },
    [onPartialTranscript, onToolCall, onTurnComplete],
  );

  const startSession = useCallback(async () => {
    if (!window.RTCPeerConnection) throw new Error('WebRTC not supported on this device');

    setState('requesting_mic');
    setError(null);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;

    setState('sending');
    setDiagnostics(prev => ({
      ...prev,
      connectionStatus: 'connecting',
      substep: 'Creating session',
    }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Sign in required to start live voice');
    }

    const { data: sessionData, error: sessionError } = await supabase.functions.invoke(
      'create-openai-realtime-session',
      {
        body: { tripId, voice },
      },
    );

    if (sessionError) {
      const status = sessionError.context?.status;
      if (status === 401) throw new Error('Your session expired. Please sign in again.');
      if (status === 403) throw new Error('You no longer have access to this trip.');
      throw new Error('Failed to initialize voice session');
    }
    const ephemeralKey = sessionData?.client_secret?.value;
    const model = sessionData?.model;
    if (!ephemeralKey || !model) throw new Error('Invalid voice session response');

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioElRef.current = audioEl;

    pc.ontrack = e => {
      audioEl.srcObject = e.streams[0];
      setState('playing');
    };

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const dc = pc.createDataChannel('oai-events');
    dcRef.current = dc;
    dc.onmessage = ev => {
      try {
        const parsed = JSON.parse(ev.data) as Record<string, unknown>;
        eventQueueRef.current = eventQueueRef.current
          .then(() => handleRealtimeEvent(parsed))
          .catch(() => undefined);
      } catch {
        // noop
      }
    };
    dc.onopen = () => setState('listening');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = sessionData?.realtime_url || 'https://api.openai.com/v1/realtime';
    const sdpResp = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    });

    if (!sdpResp.ok) throw new Error('Failed to negotiate realtime connection');
    const answerSdp = await sdpResp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    setDiagnostics(prev => ({ ...prev, connectionStatus: 'open', substep: null }));
    setState('ready');
  }, [handleRealtimeEvent, tripId, voice]);

  useEffect(() => () => clearSession(), [clearSession]);

  return {
    state,
    error,
    userTranscript,
    assistantTranscript,
    conversationHistory,
    diagnostics,
    startSession: async () => {
      try {
        await startSession();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to start voice session';
        setError(msg);
        setState('error');
        onError?.(msg);
        throw e;
      }
    },
    endSession,
    interruptPlayback: () => {
      dcRef.current?.send(JSON.stringify({ type: 'response.cancel' }));
      setState('interrupted');
    },
    sendImage: () => undefined,
    isSupported: typeof window !== 'undefined' && !!window.RTCPeerConnection,
    circuitBreakerOpen: false,
    resetCircuitBreaker: () => undefined,
  };
}
