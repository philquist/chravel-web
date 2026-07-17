import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConciergeReadAloud } from '../useConciergeReadAloud';

const preferredVoice = 'sage';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-jwt' } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  SUPABASE_PROJECT_URL: 'https://example.supabase.co',
  SUPABASE_PUBLIC_ANON_KEY: 'anon-key',
}));

vi.mock('@/features/concierge/hooks/useConciergeVoicePreference', () => ({
  useConciergeVoicePreference: () => ({ voice: preferredVoice }),
  DEFAULT_CONCIERGE_VOICE: 'coral',
}));

vi.mock('@/lib/webSpeech', () => ({
  IS_IOS: true,
}));

vi.mock('@/utils/platformDetection', () => ({
  isCapacitorNativeShell: () => false,
  isChravelNativeShell: () => false,
}));

describe('useConciergeReadAloud', () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;
  const originalAudio = global.Audio;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;

    class MockAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      removeAttribute = vi.fn();
      load = vi.fn();
      play = vi.fn().mockImplementation(async () => {
        this.onended?.();
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.Audio = MockAudio as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.Audio = originalAudio;
  });

  it('uses blob TTS on iOS and passes the saved voice preference', async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'audio/mpeg';
          if (name === 'x-voice-fallback') return 'false';
          return null;
        },
      },
      blob: async () => new Blob([mp3Bytes], { type: 'audio/mpeg' }),
    });

    const { result } = renderHook(() => useConciergeReadAloud({ tripId: 'trip-1' }));

    await act(async () => {
      await result.current.play('msg-1', 'Here is your trip update.');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: 'Here is your trip update.',
      voice: preferredVoice,
      format: 'mp3',
      tripId: 'trip-1',
      messageId: 'msg-1',
    });
    expect(JSON.parse(String(init.body)).stream).toBeUndefined();
    expect(result.current.playbackState).toBe('idle');
  });
});
