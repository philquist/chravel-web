/**
 * Lean Concierge control regressions — Search isActive lifecycle + waveform start.
 *
 * The full AIConciergeChat.test.tsx suite OOMs in constrained cloud agents when
 * rendering the real chat tree. This file stubs the heavy feature hooks so the
 * header/composer controls stay testable under a normal heap.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const conciergeSearchState = vi.hoisted(() => ({
  results: [] as unknown[],
  isLoading: false,
}));

const realtimeVoiceMock = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
}));

const fileInputRef = vi.hoisted(() => ({ current: null as HTMLInputElement | null }));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_PROJECT_URL: 'https://test.supabase.co',
  SUPABASE_PUBLIC_ANON_KEY: 'test-key',
  supabase: {
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
          single: () => Promise.resolve({ data: null }),
          order: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/hooks/useConciergeUsage', () => ({
  useConciergeUsage: () => ({
    usage: { used: 1, limit: 25, remaining: 24, isLimitReached: false, plan: 'explorer' },
    refreshUsage: vi.fn(),
    getUsageStatus: () => ({ status: 'ok', message: '24/25 Asks', color: 'text-green-500' }),
    isLimitedPlan: true,
    isFreeUser: false,
    userPlan: 'explorer',
  }),
}));

vi.mock('@/hooks/usePendingActions', () => ({
  usePendingActions: () => ({
    confirmAction: vi.fn(),
    rejectAction: vi.fn(),
    isConfirming: false,
    isRejecting: false,
  }),
}));

vi.mock('@/hooks/useSaveToTripPlaces', () => ({
  useSaveToTripPlaces: () => ({
    savePlace: vi.fn(),
    saveFlight: vi.fn(),
    saveHotel: vi.fn(),
    isUrlSaved: () => false,
    isSaving: false,
  }),
}));

vi.mock('@/hooks/useConciergeReadAloud', () => ({
  useConciergeReadAloud: () => ({
    playbackState: 'idle',
    playingMessageId: null,
    errorMessage: null,
    play: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('@/contexts/BasecampContext', () => ({
  useBasecamp: () => ({ basecamp: null }),
}));

vi.mock('@/features/concierge/hooks/useConciergeMessages', () => ({
  useConciergeMessages: () => ({
    messages: [],
    setMessages: vi.fn(),
    messagesRef: { current: [] },
    inputMessage: '',
    setInputMessage: vi.fn(),
    isTyping: false,
    setIsTyping: vi.fn(),
    setAiStatus: vi.fn(),
    historyLoadedFromServer: false,
    isMounted: { current: true },
    streamAbortRef: { current: null },
    chatScrollRef: { current: null },
    isHistoryLoading: false,
    isOffline: false,
    user: { id: 'test-user-id' },
    buildLimitReachedMessage: vi.fn(),
    handleDeleteMessage: vi.fn(),
  }),
}));

vi.mock('@/features/concierge/hooks/useConciergeAttachments', () => ({
  useConciergeAttachments: () => ({
    attachedImages: [],
    setAttachedImages: vi.fn(),
    attachedDocuments: [],
    setAttachedDocuments: vi.fn(),
    attachmentIntent: 'summarize',
    setAttachmentIntent: vi.fn(),
    fileInputRef,
    clearAttachments: vi.fn(),
  }),
}));

vi.mock('@/features/concierge/hooks/useSmartImportActions', () => ({
  useSmartImportActions: () => ({
    smartImportStates: {},
    bulkDeleteStates: {},
    handleSmartImportConfirm: vi.fn(),
    handleSmartImportDismiss: vi.fn(),
    handleBulkDeleteConfirm: vi.fn(),
    handleBulkDeleteDismiss: vi.fn(),
  }),
}));

vi.mock('@/features/concierge/hooks/useConciergeVoice', () => ({
  useConciergeVoice: () => ({
    convoVoiceState: 'idle',
    handleConvoToggle: vi.fn(),
  }),
}));

vi.mock('@/features/concierge/hooks/useConciergeStreaming', () => ({
  useConciergeStreaming: () => ({
    handleSendMessage: vi.fn(),
  }),
}));

vi.mock('@/features/smart-import/hooks/useSmartImportTaste', () => ({
  useSmartImportTaste: () => ({ canUseFreeImport: true }),
}));

vi.mock('@/features/concierge/hooks/useConciergeConversationMode', () => ({
  useConciergeConversationMode: () => ({
    active: false,
    state: 'idle',
    isSupported: true,
    toggle: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('@/features/concierge/hooks/useConversationModePreference', () => ({
  useConversationModePreference: () => ({ enabled: true }),
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => true,
  useFeatureFlagStatus: () => ({ enabled: true, isPending: false }),
}));

vi.mock('@/hooks/useUniversalSearch', () => ({
  useUniversalSearch: () => conciergeSearchState,
}));

vi.mock('@/features/concierge/hooks/useRealtimeVoice', () => ({
  useRealtimeVoice: () => ({
    phase: 'connecting',
    isActive: true,
    isCapturing: false,
    isPlaying: false,
    errorMessage: null,
    micPermission: 'unknown',
    isRecording: false,
    turns: [],
    latestUserText: '',
    latestAssistantText: '',
    start: realtimeVoiceMock.start,
    stop: realtimeVoiceMock.stop,
  }),
}));

vi.mock('@/features/chat/components/ChatMessages', () => ({
  ChatMessages: () => null,
}));

// Keep the overlay out of this lean suite — RealtimeVoiceButton.test.tsx owns
// the lazy-mount + overlay mount assertion. Mounting the real overlay here
// pulls theme/portal code and can OOM the worker after Search assertions.
vi.mock('@/features/concierge/components/RealtimeVoiceOverlay', () => ({
  RealtimeVoiceOverlay: () => <div data-testid="realtime-voice-overlay">Voice overlay</div>,
}));

import { AIConciergeChat } from '../AIConciergeChat';

describe('AIConciergeChat controls (lean)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    conciergeSearchState.results = [];
    conciergeSearchState.isLoading = false;
    realtimeVoiceMock.start.mockResolvedValue(undefined);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  const renderChat = (props: Partial<React.ComponentProps<typeof AIConciergeChat>> = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <AIConciergeChat tripId="test-trip" isActive {...props} />
      </QueryClientProvider>,
    );

  it('keeps Search open while Concierge remains active', () => {
    const { rerender } = renderChat({ isActive: true });

    fireEvent.click(screen.getByLabelText(/search trip/i));
    expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <AIConciergeChat tripId="test-trip" isActive />
      </QueryClientProvider>,
    );
    expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();
  });

  it('closes Search when Concierge becomes inactive', () => {
    const { rerender } = renderChat({ isActive: true });

    fireEvent.click(screen.getByLabelText(/search trip/i));
    expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <AIConciergeChat tripId="test-trip" isActive={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByPlaceholderText(/search across trip/i)).not.toBeInTheDocument();
  });

  it('associates the upload label with the file input for reliable activation', () => {
    renderChat();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input?.id).toBeTruthy();
    expect(screen.getByTestId('header-upload-btn').getAttribute('for')).toBe(input.id);
  });

  it('lazy-mounts realtime voice and starts the session from the waveform button', async () => {
    renderChat();

    expect(realtimeVoiceMock.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('realtime-voice-button'));

    await waitFor(() => {
      expect(realtimeVoiceMock.start).toHaveBeenCalledWith('test-trip');
    });
    expect(screen.getByTestId('realtime-voice-overlay')).toBeInTheDocument();
  });
});
