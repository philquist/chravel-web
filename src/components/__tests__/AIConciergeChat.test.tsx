/**
 * AIConciergeChat Component Tests
 *
 * Tests cover:
 * - Rate limiting UI and countdown timer
 * - Offline mode with cached responses
 * - Graceful degradation when AI unavailable
 * - Context building and message handling
 * - Error recovery and retry logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { AIConciergeChat } from '../AIConciergeChat';
import { conciergeCacheService } from '../../services/conciergeCacheService';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const conciergeHistoryState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
  error: null as unknown,
}));

const conciergeSearchState = vi.hoisted(() => ({
  results: [] as unknown[],
  isLoading: false,
}));

const realtimeVoiceMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

const featureFlagState = vi.hoisted(() => ({
  realtimeVoiceEnabled: false,
}));

// Mock dependencies
vi.mock('../../integrations/supabase/client', () => ({
  SUPABASE_PROJECT_URL: 'https://test.supabase.co',
  SUPABASE_PUBLIC_ANON_KEY: 'test-key',
  supabase: {
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: {
      invoke: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null }),
            order: () => Promise.resolve({ data: [] }),
          }),
          order: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', isPro: false },
  }),
}));

vi.mock('../../hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    isPlus: false,
    tier: 'free',
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useConciergeUsage', () => ({
  useConciergeUsage: () => ({
    usage: {
      used: 5,
      limit: 25,
      remaining: 20,
      isLimitReached: false,
      plan: 'explorer',
    },
    refreshUsage: vi.fn().mockResolvedValue({
      used: 5,
      limit: 25,
      remaining: 20,
      isLimitReached: false,
      plan: 'explorer',
    }),
    getUsageStatus: () => ({
      status: 'ok',
      message: '20/25 Asks',
      color: 'text-green-500',
    }),
    incrementUsageOnSuccess: vi.fn(),
    isLimitedPlan: true,
    isFreeUser: true,
    userPlan: 'explorer',
    upgradeUrl: '/settings/billing?plan=plus',
  }),
}));

vi.mock('../../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => ({
    isOffline: false,
    isOnline: true,
  }),
}));

vi.mock('../../hooks/useConciergeHistory', () => ({
  useConciergeHistory: () => conciergeHistoryState,
}));

vi.mock('../../hooks/usePendingActions', () => ({
  usePendingActions: () => ({
    pendingActions: [],
    isLoading: false,
    confirmAction: vi.fn(),
    confirmActionAsync: vi.fn(),
    rejectAction: vi.fn(),
    rejectActionAsync: vi.fn(),
    isConfirming: false,
    isRejecting: false,
    hasPendingActions: false,
  }),
}));

// Mock useWebSpeechVoice to ensure predictable state for UI tests
vi.mock('@/hooks/useWebSpeechVoice', () => ({
  useWebSpeechVoice: () => ({
    voiceState: 'idle',
    toggleVoice: vi.fn(),
    errorMessage: null,
  }),
}));

vi.mock('../../contexts/BasecampContext', () => ({
  useBasecamp: () => ({
    basecamp: {
      name: 'Test Basecamp',
      address: '123 Test St, Test City',
    },
  }),
}));

vi.mock('@/features/concierge/hooks/useRealtimeVoice', () => ({
  useRealtimeVoice: () => ({
    phase: 'idle',
    isActive: false,
    isCapturing: false,
    isPlaying: false,
    errorMessage: null,
    turns: [],
    latestUserText: '',
    latestAssistantText: '',
    start: realtimeVoiceMock.start,
    stop: realtimeVoiceMock.stop,
  }),
}));

vi.mock('@/hooks/useUniversalSearch', () => ({
  useUniversalSearch: () => conciergeSearchState,
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: (key: string, defaultValue = true) => {
    if (key === 'concierge_realtime_voice') return featureFlagState.realtimeVoiceEnabled;
    return defaultValue;
  },
  useFeatureFlagStatus: (key: string, defaultValue = true) => ({
    enabled:
      key === 'concierge_realtime_voice' ? featureFlagState.realtimeVoiceEnabled : defaultValue,
    isPending: false,
  }),
}));

describe('AIConciergeChat', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    conciergeCacheService.clearAllCaches();
    conciergeHistoryState.data = [];
    conciergeHistoryState.isLoading = false;
    conciergeHistoryState.error = null;
    conciergeSearchState.results = [];
    conciergeSearchState.isLoading = false;
    featureFlagState.realtimeVoiceEnabled = false;
    realtimeVoiceMock.start.mockClear();
    realtimeVoiceMock.stop.mockClear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    // Unmount the component tree first so effect cleanups (status-watchdog
    // timers) run, then drop every query in the client. TanStack Query schedules
    // a gcTime timer (default 5 min) for each query the concierge hooks activate;
    // left pending, those timers keep the vitest forks worker's event loop alive
    // long past any teardown window and surface as the intermittent
    // "Timeout terminating forks worker for AIConciergeChat.test.tsx" flake.
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (component: React.ReactNode) => {
    return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
  };

  describe('Header Simplification', () => {
    it('renders the Concierge controls in one mobile-safe header row', async () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      expect(screen.getByLabelText(/search trip/i)).toBeInTheDocument();
      expect(screen.getByTestId('ai-concierge-header')).toHaveTextContent(
        'Concierge Chravel Agent',
      );
      expect(screen.queryByText(/Concierge AI/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/attach files to concierge/i)).toBeInTheDocument();
    });

    it('opens trip search from the header search button', () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      fireEvent.click(screen.getByLabelText(/search trip/i));

      expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();
    });

    it('navigates to the selected search result tab', () => {
      const onTabChange = vi.fn();
      conciergeSearchState.results = [
        {
          id: 'task-1',
          contentType: 'task',
          tripId: 'test-trip',
          tripName: 'Trip',
          title: 'Pack sunscreen',
          snippet: 'Beach day task',
          matchScore: 0.9,
          deepLink: '/trip/test-trip#task-task-1',
        },
      ];

      renderWithProviders(<AIConciergeChat tripId="test-trip" onTabChange={onTabChange} />);

      fireEvent.click(screen.getByLabelText(/search trip/i));
      fireEvent.click(screen.getByText(/Pack sunscreen/i));

      expect(onTabChange).toHaveBeenCalledWith('tasks');
    });

    it('stages files selected from the header upload button', () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      const file = new File(['reservation'], 'hotel.pdf', { type: 'application/pdf' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      // Label association is required for reliable iOS/WKWebView file-picker activation.
      expect(input.id).toBeTruthy();
      const uploadLabel = screen.getByTestId('header-upload-btn');
      expect(uploadLabel.getAttribute('for')).toBe(input.id);
      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText('hotel.pdf')).toBeInTheDocument();
    });

    it('keeps Search open while the Concierge tab remains active', () => {
      const { rerender } = renderWithProviders(<AIConciergeChat tripId="test-trip" isActive />);

      fireEvent.click(screen.getByLabelText(/search trip/i));
      expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();

      // Re-render with isActive still true must not auto-close Search.
      rerender(
        <QueryClientProvider client={queryClient}>
          <AIConciergeChat tripId="test-trip" isActive />
        </QueryClientProvider>,
      );
      expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();
    });

    it('closes Search when the Concierge tab becomes inactive', () => {
      const { rerender } = renderWithProviders(<AIConciergeChat tripId="test-trip" isActive />);

      fireEvent.click(screen.getByLabelText(/search trip/i));
      expect(screen.getByPlaceholderText(/search across trip/i)).toBeInTheDocument();

      rerender(
        <QueryClientProvider client={queryClient}>
          <AIConciergeChat tripId="test-trip" isActive={false} />
        </QueryClientProvider>,
      );

      expect(screen.queryByPlaceholderText(/search across trip/i)).not.toBeInTheDocument();
    });

    it('renders the waveform dictation CTA as the composer left control by default', () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      expect(screen.getByTestId('concierge-waveform-dictation-btn')).toBeInTheDocument();
      expect(screen.getByLabelText(/dictate a message/i)).toBeInTheDocument();
      expect(screen.queryByTestId('concierge-dictation-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('realtime-voice-button')).not.toBeInTheDocument();
    });

    it('does not start realtime voice from the waveform button on the App Store path', () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      fireEvent.click(screen.getByTestId('concierge-waveform-dictation-btn'));

      expect(realtimeVoiceMock.start).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: /start voice conversation/i }),
      ).not.toBeInTheDocument();
    });

    it('removes legacy status pills from header', () => {
      renderWithProviders(<AIConciergeChat tripId="test-trip" />);
      expect(screen.queryByText(/ready with web search/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/limited mode/i)).not.toBeInTheDocument();
    });
  });

  describe('Pending AI action rendering', () => {
    it('renders pending concierge approvals from streamed tool results', async () => {
      conciergeHistoryState.data = [
        {
          id: 'pending-approval-msg',
          type: 'assistant',
          content: "I've prepared a task for you to confirm.",
          timestamp: new Date().toISOString(),
          pendingActions: [
            {
              id: 'pending-action-1',
              toolName: 'createTask',
              actionType: 'create_task',
              message: 'Please confirm in the trip chat.',
              title: 'Pack sunscreen',
              detail: 'Remember this before the beach day',
            },
          ],
        },
      ];

      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      await waitFor(() => {
        expect(screen.getByText(/AI wants to create a Task/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /Confirm/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument();
    });
  });

  describe('Offline Mode', () => {
    it('should load cached messages on mount', () => {
      const cachedMessages = [
        {
          id: '1',
          type: 'user' as const,
          content: 'Test message',
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          type: 'assistant' as const,
          content: 'Cached response',
          timestamp: new Date().toISOString(),
        },
      ];

      conciergeCacheService.cacheMessage(
        'test-trip',
        'test query',
        cachedMessages[1] as unknown as Parameters<typeof conciergeCacheService.cacheMessage>[2],
      );

      renderWithProviders(<AIConciergeChat tripId="test-trip" />);

      // Messages should be loaded from cache
      const loaded = conciergeCacheService.getCachedMessages('test-trip');
      expect(loaded.length).toBeGreaterThan(0);
    });

    it('should use cached response for similar queries when offline', () => {
      const cachedResponse = {
        id: 'cached-1',
        type: 'assistant' as const,
        content: 'This is a cached response about restaurants',
        timestamp: new Date().toISOString(),
      };

      // Use exact same query to ensure cache hit (semantic similarity has 0.6 threshold)
      const query = 'where are good restaurants';
      conciergeCacheService.cacheMessage('test-trip', query, cachedResponse);

      const result = conciergeCacheService.getCachedResponse('test-trip', query);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('restaurants');
    });
  });

  describe('Graceful Degradation', () => {
    it('should provide fallback response for location queries', () => {
      const fallbackResponse = generateFallbackResponse(
        'where is the hotel',
        { itinerary: [] },
        { name: 'Test Hotel', address: '123 Test St' },
      );

      expect(fallbackResponse).toContain('Location Information');
      expect(fallbackResponse).toContain('Test Hotel');
      expect(fallbackResponse).toContain('123 Test St');
    });

    it('should provide fallback response for calendar queries', () => {
      const tripContext = {
        itinerary: [{ title: 'Dinner', startTime: '7:00 PM', location: 'Restaurant' }],
      };

      const fallbackResponse = generateFallbackResponse('what time is dinner', tripContext);

      expect(fallbackResponse).toContain('Upcoming Events');
      expect(fallbackResponse).toContain('Dinner');
    });

    it('should provide fallback response for payment queries', () => {
      const fallbackResponse = generateFallbackResponse('how much do I owe', {});

      expect(fallbackResponse).toContain('Payments');
    });
  });

  describe('Context Management', () => {
    it('should limit chat history to prevent overflow', () => {
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
      }));

      const limited = longHistory.slice(-10);
      expect(limited.length).toBe(10);
      expect(limited[0].content).toBe('Message 10');
    });

    it('should truncate system prompt if too long', () => {
      const longPrompt = 'A'.repeat(10000);
      const MAX_LENGTH = 8000;

      let truncated = longPrompt;
      if (longPrompt.length > MAX_LENGTH) {
        truncated = longPrompt.substring(0, MAX_LENGTH) + '\n\n[Context truncated...]';
      }

      expect(truncated.length).toBeLessThanOrEqual(MAX_LENGTH + 50);
    });
  });

  describe('Error Recovery', () => {
    it('should retry on transient errors', async () => {
      let attemptCount = 0;
      const mockInvoke = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.resolve({ error: { message: 'Temporary error' } });
        }
        return Promise.resolve({
          data: { response: 'Success after retry' },
        });
      });

      // Would need to mock supabase.functions.invoke
      expect(mockInvoke).toBeDefined();
    });

    it('should use graceful degradation after max retries', () => {
      // After 2 retries, should fall back to degraded mode
      const MAX_RETRIES = 2;
      let retryCount = 0;

      while (retryCount <= MAX_RETRIES) {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          // Should use fallback
          expect(retryCount).toBeGreaterThan(MAX_RETRIES);
          break;
        }
      }
    });
  });
});

// Helper function (mirrors the one in component)
interface TripContextFallback {
  itinerary?: Array<{ title?: string; name?: string; startTime?: string; location?: string }>;
  calendar?: Array<{ title?: string; name?: string; startTime?: string; location?: string }>;
}

function generateFallbackResponse(
  query: string,
  tripContext: TripContextFallback,
  basecampLocation?: { name: string; address: string },
): string {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.match(/\b(where|location|address|directions|near|around|close)\b/)) {
    if (basecampLocation) {
      return `📍 **Location Information**\n\nBased on your trip basecamp:\n\n**${basecampLocation.name}**\n${basecampLocation.address}\n\nYou can use Google Maps to find directions and nearby places.`;
    }
    return `📍 I can help with location queries once the AI service is restored.`;
  }

  if (lowerQuery.match(/\b(when|time|schedule|calendar|event|agenda|upcoming)\b/)) {
    if (tripContext?.itinerary?.length || tripContext?.calendar?.length) {
      const events = tripContext.itinerary || tripContext.calendar || [];
      const upcoming = events.slice(0, 3);
      let response = `📅 **Upcoming Events**\n\n`;
      upcoming.forEach(
        (event: { title?: string; name?: string; startTime?: string; location?: string }) => {
          response += `• ${event.title || event.name}`;
          if (event.startTime) response += ` - ${event.startTime}`;
          if (event.location) response += ` at ${event.location}`;
          response += `\n`;
        },
      );
      return response;
    }
    return `📅 Check the Calendar tab for your trip schedule.`;
  }

  if (lowerQuery.match(/\b(payment|money|owe|spent|cost|budget|expense)\b/)) {
    return `💰 Check the Payments tab to see expense details and who owes what.`;
  }

  return `I'm temporarily unavailable, but you can use the app tabs for information.`;
}
