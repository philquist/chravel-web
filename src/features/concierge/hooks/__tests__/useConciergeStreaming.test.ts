import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { useConciergeStreaming } from '../useConciergeStreaming';
import type { ChatMessage } from '@/features/concierge/types';
import type { ConciergeStreamCallbacks } from '@/services/conciergeGateway';

const { invokeConciergeStreamMock } = vi.hoisted(() => ({
  invokeConciergeStreamMock: vi.fn(),
}));

vi.mock('@/services/conciergeGateway', async () => {
  const actual = await vi.importActual<typeof import('@/services/conciergeGateway')>(
    '@/services/conciergeGateway',
  );
  return {
    ...actual,
    invokeConciergeStream: invokeConciergeStreamMock,
  };
});

function createBaseParams(overrides: Partial<Parameters<typeof useConciergeStreaming>[0]> = {}) {
  let messages: ChatMessage[] = [];
  const setMessages = vi.fn((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    messages = updater(messages);
  });

  const params: Parameters<typeof useConciergeStreaming>[0] = {
    tripId: 'trip-1',
    isDemoMode: false,
    userId: 'user-1',
    isOffline: false,
    isLimitedPlan: false,
    inputMessage: 'Where are we staying?',
    setInputMessage: vi.fn(),
    isTyping: false,
    messages,
    setMessages,
    messagesRef: { current: messages },
    isMounted: { current: true },
    streamAbortRef: { current: null },
    setIsTyping: vi.fn(),
    setAiStatus: vi.fn(),
    isLimitReached: false,
    refreshUsage: vi.fn(async () => undefined),
    buildLimitReachedMessage: vi.fn(() => ({
      id: 'limit',
      type: 'assistant' as const,
      content: 'limit',
      timestamp: new Date().toISOString(),
    })),
    attachedImages: [],
    attachedDocuments: [],
    attachmentIntent: 'smart_import',
    clearAttachments: vi.fn(),
    queryClient: new QueryClient(),
    ...overrides,
  };

  return {
    params,
    getMessages: () => messages,
    setMessages,
  };
}

describe('useConciergeStreaming', () => {
  beforeEach(() => {
    invokeConciergeStreamMock.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns early for empty input with no attachments', async () => {
    const { params, setMessages } = createBaseParams({
      inputMessage: '   ',
      messages: [],
      messagesRef: { current: [] },
    });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    expect(setMessages).not.toHaveBeenCalled();
    expect(invokeConciergeStreamMock).not.toHaveBeenCalled();
  });

  it('pushes offline fallback messages and does not start streaming when offline', async () => {
    const { params, getMessages } = createBaseParams({
      isOffline: true,
    });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    const messages = getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('user');
    expect(messages[1].type).toBe('assistant');
    expect(messages[1].content).toContain('Offline Mode');
    expect(invokeConciergeStreamMock).not.toHaveBeenCalled();
  });

  it('updates ai status and assistant metadata when stream metadata arrives', async () => {
    let callbacks: ConciergeStreamCallbacks | null = null;
    invokeConciergeStreamMock.mockImplementation((_, cb: ConciergeStreamCallbacks) => {
      callbacks = cb;
      return { abort: vi.fn() };
    });

    const setAiStatus = vi.fn();
    const { params, getMessages } = createBaseParams({ setAiStatus });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    expect(callbacks).not.toBeNull();

    await act(async () => {
      callbacks?.onChunk('Partial answer');
      callbacks?.onMetadata({
        type: 'metadata',
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        sources: [{ title: 'Source A', url: 'https://example.com', snippet: 'snippet' }],
      });
    });

    const messages = getMessages();
    const assistantMessage = messages.find(msg => msg.type === 'assistant');
    expect(assistantMessage?.usage?.total_tokens).toBe(3);
    expect(assistantMessage?.sources?.[0]?.title).toBe('Source A');
    expect(setAiStatus).toHaveBeenCalledWith('connected');
  });

  it('triggers timeout fallback and stops typing when stream stays idle', async () => {
    vi.useFakeTimers();

    const abort = vi.fn();
    invokeConciergeStreamMock.mockImplementation((_, cb: ConciergeStreamCallbacks) => {
      return {
        abort: () => {
          cb.onDone();
          abort();
        },
      };
    });

    const setAiStatus = vi.fn();
    const setIsTyping = vi.fn();
    const { params, getMessages } = createBaseParams({ setAiStatus, setIsTyping });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    const messages = getMessages();
    const timedOutMessage = messages.find(
      msg => msg.type === 'assistant' && msg.content.includes('Request timed out'),
    );

    expect(timedOutMessage).toBeDefined();
    expect(setAiStatus).toHaveBeenCalledWith('timeout');
    expect(setIsTyping).toHaveBeenCalledWith(false);
    expect(abort).toHaveBeenCalled();
  });

  it('does not call the stream when the per-trip limit is already reached', async () => {
    const refreshUsage = vi.fn(async () => undefined);
    const buildLimitReachedMessage = vi.fn(() => ({
      id: 'limit',
      type: 'assistant' as const,
      content: 'limit',
      timestamp: new Date().toISOString(),
    }));
    const { params, getMessages } = createBaseParams({
      isLimitedPlan: true,
      isLimitReached: true,
      refreshUsage,
      buildLimitReachedMessage,
    });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    expect(invokeConciergeStreamMock).not.toHaveBeenCalled();
    expect(refreshUsage).not.toHaveBeenCalled();
    expect(buildLimitReachedMessage).toHaveBeenCalledTimes(1);
    expect(getMessages().some(msg => msg.id === 'limit')).toBe(true);
  });

  it('refreshes usage after a completed stream for limited plans', async () => {
    let callbacks: ConciergeStreamCallbacks | null = null;
    invokeConciergeStreamMock.mockImplementation((_, cb: ConciergeStreamCallbacks) => {
      callbacks = cb;
      return { abort: vi.fn() };
    });

    const refreshUsage = vi.fn(async () => undefined);
    const { params } = createBaseParams({
      isLimitedPlan: true,
      refreshUsage,
    });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    await act(async () => {
      callbacks?.onDone();
    });

    expect(refreshUsage).toHaveBeenCalledTimes(1);
  });

  it('does not replace flight-card-only responses with an error fallback on stream done', async () => {
    let callbacks: ConciergeStreamCallbacks | null = null;
    invokeConciergeStreamMock.mockImplementation((_, cb: ConciergeStreamCallbacks) => {
      callbacks = cb;
      return { abort: vi.fn() };
    });

    const { params, getMessages } = createBaseParams({
      inputMessage: 'show me flights from LAX to JFK',
    });

    const { result } = renderHook(() => useConciergeStreaming(params));

    await act(async () => {
      await result.current.handleSendMessage();
    });

    await act(async () => {
      callbacks?.onFunctionCall?.('searchFlights', {
        success: true,
        origin: 'LAX',
        destination: 'JFK',
        departureDate: '2026-06-01',
        passengers: 1,
        deeplink: 'https://example.com/flights',
      });
      callbacks?.onDone();
    });

    const assistant = getMessages().find(msg => msg.type === 'assistant');
    expect(assistant?.functionCallFlights?.length).toBe(1);
    expect(assistant?.content).not.toContain('encountered an error processing your request');
  });
});
