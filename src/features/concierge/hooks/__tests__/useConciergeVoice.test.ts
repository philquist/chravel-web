import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConciergeVoice } from '../useConciergeVoice';

const liveKitMock = vi.hoisted(() => ({
  callbacks: {
    onTurnComplete: undefined as undefined | ((...args: any[]) => void),
    onPartialTranscript: undefined as undefined | ((...args: any[]) => void),
  },
}));

vi.mock('@/hooks/useWebSpeechVoice', () => ({
  useWebSpeechVoice: () => ({ voiceState: 'idle', toggleVoice: vi.fn() }),
}));

vi.mock('@/hooks/useVoiceToolHandler', () => ({
  useVoiceToolHandler: () => ({ handleToolCall: vi.fn() }),
}));

vi.mock('@/hooks/useLiveKitVoice', () => ({
  useLiveKitVoice: (params: any) => {
    liveKitMock.callbacks.onTurnComplete = params.onTurnComplete;
    liveKitMock.callbacks.onPartialTranscript = params.onPartialTranscript;
    return {
      state: 'ready',
      error: null,
      userTranscript: '',
      assistantTranscript: '',
      conversationHistory: [],
      diagnostics: null,
      startSession: vi.fn(),
      endSession: vi.fn(async () => {}),
      circuitBreakerOpen: false,
      resetCircuitBreaker: vi.fn(),
    };
  },
}));

const makeParams = (setMessages = vi.fn()) => ({
  tripId: 'trip-1',
  userId: 'user-1',
  isDemoMode: false,
  isLimitedPlan: false,
  incrementUsageOnSuccess: vi.fn(async () => ({ incremented: true })),
  setMessages,
  setInputMessage: vi.fn(),
  buildLimitReachedMessage: vi.fn(() => ({
    id: 'limit',
    type: 'assistant' as const,
    content: 'limit',
    timestamp: new Date().toISOString(),
  })),
});

describe('useConciergeVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles rapid assistant final + turn_complete without dropping persisted message', async () => {
    const setMessages = vi.fn();
    renderHook(() => useConciergeVoice(makeParams(setMessages)));

    act(() => {
      liveKitMock.callbacks.onPartialTranscript?.({
        role: 'assistant',
        text: 'Final answer',
        isFinal: true,
      });
    });

    const ack = vi.fn();
    await act(async () => {
      await liveKitMock.callbacks.onTurnComplete?.(
        'question',
        'Final answer',
        [],
        { id: 't-1' },
        ack,
      );
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    const updater = setMessages.mock.calls[0][0];
    const result = updater([]);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('question');
    expect(result[1].content).toBe('Final answer');
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('keeps partial streaming stable across interrupted/listening/sending style transitions', () => {
    const { result } = renderHook(() => useConciergeVoice(makeParams()));

    act(() => {
      liveKitMock.callbacks.onPartialTranscript?.({ role: 'user', text: 'Hel', isFinal: false });
      liveKitMock.callbacks.onPartialTranscript?.({
        role: 'user',
        text: 'Hello there',
        isFinal: true,
      });
    });

    expect(result.current.streamingUserMessage?.content).toBe('Hello there');

    act(() => {
      liveKitMock.callbacks.onPartialTranscript?.({
        role: 'assistant',
        text: 'Working on it',
        isFinal: false,
      });
    });

    expect(result.current.streamingVoiceMessage?.content).toBe('Working on it');
  });

  it('does not create duplicate or missing persisted messages per completed turn', async () => {
    const setMessages = vi.fn();
    renderHook(() => useConciergeVoice(makeParams(setMessages)));

    await act(async () => {
      await liveKitMock.callbacks.onTurnComplete?.('u1', 'a1', [], { id: 'turn-1' }, vi.fn());
      await liveKitMock.callbacks.onTurnComplete?.('u2', 'a2', [], { id: 'turn-2' }, vi.fn());
    });

    expect(setMessages).toHaveBeenCalledTimes(2);
    const firstBatch = setMessages.mock.calls[0][0]([]);
    const secondBatch = setMessages.mock.calls[1][0](firstBatch);
    expect(secondBatch.filter((m: any) => m.type === 'user')).toHaveLength(2);
    expect(secondBatch.filter((m: any) => m.type === 'assistant')).toHaveLength(2);
    expect(secondBatch.map((m: any) => m.content)).toEqual(['u1', 'a1', 'u2', 'a2']);
  });
});
