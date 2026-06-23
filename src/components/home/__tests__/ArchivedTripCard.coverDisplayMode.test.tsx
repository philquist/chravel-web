import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedTripCard } from '../ArchivedTripCard';

vi.mock('../../OptimizedImage', () => ({
  OptimizedImage: ({ fit, alt }: { fit?: 'cover' | 'contain'; alt: string }) => (
    <img alt={alt} className={fit === 'contain' ? 'object-contain' : 'object-cover'} />
  ),
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isPaid: true }),
}));

const baseTrip = {
  id: 'archived-1',
  name: 'Archived Getaway',
  destination: 'Denver, CO',
  start_date: '2026-05-01',
  end_date: '2026-05-05',
  trip_type: 'consumer' as const,
  cover_image_url: 'https://example.com/archived-cover.jpg',
};

describe('ArchivedTripCard cover display mode', () => {
  it('uses object-contain when cover_display_mode is contain', () => {
    render(
      <ArchivedTripCard
        trip={{ ...baseTrip, cover_display_mode: 'contain' }}
        onRestore={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const img = screen.getByAltText('Archived Getaway cover');
    expect(img.className).toContain('object-contain');
  });

  it('uses object-cover when cover_display_mode is cover', () => {
    render(
      <ArchivedTripCard
        trip={{ ...baseTrip, cover_display_mode: 'cover' }}
        onRestore={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const img = screen.getByAltText('Archived Getaway cover');
    expect(img.className).toContain('object-cover');
  });
});
