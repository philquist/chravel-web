import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TripExportModal } from '../TripExportModal';

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    upgradeToTier: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/usePdfExportUsage', () => ({
  usePdfExportUsage: () => ({
    recordExport: vi.fn(),
    getUsageStatus: () => ({ status: 'available' as const, message: '' }),
    isPaidUser: true,
    canExport: true,
  }),
}));

describe('TripExportModal layout (footer visibility)', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onExport: vi.fn().mockResolvedValue(undefined),
    tripName: 'Test Trip',
    tripId: '550e8400-e29b-41d4-a716-446655440000',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps footer actions in the modal flex column so they are not pushed below max-height', () => {
    render(<TripExportModal {...baseProps} />);

    const panel = screen.getByTestId('trip-export-modal-panel');
    expect(panel).toBeTruthy();

    const scrollRegion = screen.getByTestId('trip-export-modal-scroll');
    expect(scrollRegion.className).toContain('min-h-0');
    expect(scrollRegion.className).toContain('flex-1');
    expect(scrollRegion.className).toContain('overflow-y-auto');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: /create recap/i })).toBeVisible();

    const footer = screen.getByRole('button', { name: 'Cancel' }).parentElement;
    expect(footer).toBeTruthy();
    expect(panel?.contains(footer)).toBe(true);
  });
});
