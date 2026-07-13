import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

vi.mock('@/hooks/useLongPress', () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMobilePortrait', () => ({
  useMobilePortrait: () => false,
}));

vi.mock('@/hooks/useResolvedTripMediaUrl', () => ({
  useResolvedTripMediaUrl: () => null,
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('../MessageActions', () => ({
  MessageActions: () => null,
}));

vi.mock('../GoogleMapsWidget', () => ({
  GoogleMapsWidget: () => null,
}));

vi.mock('../GroundingCitationCard', () => ({
  GroundingCitationCard: () => null,
}));

vi.mock('../ImageLightbox', () => ({
  ImageLightbox: () => null,
}));

vi.mock('../ReadReceipts', () => ({
  ReadReceipts: () => <div data-testid="read-receipts" />,
}));

vi.mock('../VoiceNotePlayer', () => ({
  VoiceNotePlayer: ({ src }: { src: string }) => (
    <div data-testid="voice-note-player" data-src={src} />
  ),
}));

const baseProps = {
  id: 'm1',
  text: '',
  senderName: 'Alex',
  timestamp: '2026-07-13T12:00:00.000Z',
  onReaction: vi.fn(),
  currentUserId: 'user-1',
  isOwnMessage: false,
  isLastInGroup: true,
};

describe('MessageBubble media polish', () => {
  it('renders an image mosaic for multiple image attachments', () => {
    render(
      <MessageBubble
        {...baseProps}
        attachments={[
          { type: 'image', ref_id: 'a', url: 'https://cdn/a.jpg' },
          { type: 'image', ref_id: 'b', url: 'https://cdn/b.jpg' },
          { type: 'image', ref_id: 'c', url: 'https://cdn/c.jpg' },
        ]}
      />,
    );

    expect(screen.getByLabelText('View image 1')).toBeInTheDocument();
    expect(screen.getByLabelText('View image 2')).toBeInTheDocument();
    expect(screen.getByLabelText('View image 3')).toBeInTheDocument();
  });

  it('renders VoiceNotePlayer for audio attachments', () => {
    render(
      <MessageBubble
        {...baseProps}
        attachments={[
          {
            type: 'audio',
            ref_id: 'v1',
            url: 'https://cdn/voice.webm',
            mimeType: 'audio/webm',
            durationMs: 2500,
            waveform: [0.2, 0.5],
          },
        ]}
      />,
    );

    expect(screen.getByTestId('voice-note-player')).toHaveAttribute(
      'data-src',
      'https://cdn/voice.webm',
    );
  });

  it('renders a place mini-card for Google Maps link previews', () => {
    render(
      <MessageBubble
        {...baseProps}
        text="https://maps.google.com/?q=place"
        linkPreview={{
          url: 'https://www.google.com/maps/place/?q=place_id:abc',
          title: 'Sushi Saito',
          description: 'Tokyo',
          image: 'https://cdn/place.jpg',
          domain: 'google.com',
        }}
      />,
    );

    expect(screen.getByText('Sushi Saito')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sushi Saito/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/place/?q=place_id:abc',
    );
  });

  it('renders a bubble tail on the last message in a group', () => {
    const { container } = render(<MessageBubble {...baseProps} text="hello" isLastInGroup />);
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });
});
