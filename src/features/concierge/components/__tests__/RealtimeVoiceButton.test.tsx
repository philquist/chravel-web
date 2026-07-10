import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { RealtimeVoiceButton } from '../RealtimeVoiceButton';

const startMock = vi.fn();
const stopMock = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
    start: startMock,
    stop: stopMock,
  }),
}));

vi.mock('@/features/concierge/components/RealtimeVoiceOverlay', () => ({
  RealtimeVoiceOverlay: () => <div data-testid="realtime-voice-overlay">Voice overlay</div>,
}));

describe('RealtimeVoiceButton', () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    startMock.mockResolvedValue(undefined);
    vi.mocked(toast.error).mockClear();
  });

  it('lazy-mounts the voice session and starts it on waveform tap', async () => {
    render(<RealtimeVoiceButton tripId="trip-1" />);

    expect(startMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('realtime-voice-button'));

    await waitFor(() => {
      expect(startMock).toHaveBeenCalledWith('trip-1');
    });
    expect(screen.getByTestId('realtime-voice-overlay')).toBeInTheDocument();
  });

  it('toasts instead of silently ignoring taps when usage is exhausted', () => {
    render(<RealtimeVoiceButton tripId="trip-1" disabled />);

    fireEvent.click(screen.getByTestId('realtime-voice-button'));

    expect(startMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
