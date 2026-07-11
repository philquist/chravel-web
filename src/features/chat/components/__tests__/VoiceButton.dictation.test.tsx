/**
 * VoiceButton — App Store waveform dictation contracts.
 * Full Concierge mounts are covered by AIConciergeChat.controls; this file
 * locks the iOS-safe gesture + dictation wiring on the button itself.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VoiceButton } from '../VoiceButton';

describe('VoiceButton waveform dictation', () => {
  it('exposes the Concierge waveform dictation test id and dictate label', () => {
    render(<VoiceButton voiceState="idle" isEligible onToggle={vi.fn()} />);

    const btn = screen.getByTestId('concierge-waveform-dictation-btn');
    expect(btn).toHaveAttribute('aria-label', 'Dictate a message');
  });

  it('toggles dictation on click without mounting realtime voice', () => {
    const onToggle = vi.fn();
    render(<VoiceButton voiceState="idle" isEligible onToggle={onToggle} />);

    fireEvent.click(screen.getByTestId('concierge-waveform-dictation-btn'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('realtime-voice-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('realtime-voice-overlay')).not.toBeInTheDocument();
  });

  it('prevents default on pointerdown so the textarea cannot steal focus before STT', () => {
    render(<VoiceButton voiceState="idle" isEligible onToggle={vi.fn()} />);

    const btn = screen.getByTestId('concierge-waveform-dictation-btn');
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    const prevented = !btn.dispatchEvent(event) || event.defaultPrevented;
    expect(prevented).toBe(true);
  });
});
