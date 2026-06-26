import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TripExportModal } from '../TripExportModal';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    upgradeToTier: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
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
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 667,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps footer actions in the modal grid so they are not pushed below max-height', () => {
    render(<TripExportModal {...baseProps} />);

    const panel = screen.getByTestId('trip-export-modal-panel');
    expect(panel).toBeTruthy();
    expect(panel.className).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');

    const scrollRegion = screen.getByTestId('trip-export-modal-scroll');
    expect(scrollRegion.className).toContain('min-h-0');
    expect(scrollRegion.className).toContain('overflow-y-auto');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: /create recap/i })).toBeVisible();

    const footer = screen.getByTestId('trip-export-modal-footer');
    expect(panel.contains(footer)).toBe(true);
    expect(footer.contains(screen.getByRole('button', { name: 'Cancel' }))).toBe(true);
    expect(footer.contains(screen.getByRole('button', { name: /create recap/i }))).toBe(true);
  });

  it('pins the privacy note in the footer with the action buttons', () => {
    render(<TripExportModal {...baseProps} />);

    const footer = screen.getByTestId('trip-export-modal-footer');
    expect(footer.textContent).toContain('Emails and phone numbers hidden');

    const scrollRegion = screen.getByTestId('trip-export-modal-scroll');
    expect(scrollRegion.textContent).not.toContain('Emails and phone numbers hidden');
  });

  it('bounds the panel height via visual viewport when open (iOS Safari trips list)', () => {
    render(<TripExportModal {...baseProps} />);

    const panel = screen.getByTestId('trip-export-modal-panel');
    expect(panel.className).toContain('trip-export-modal-panel');
    expect(panel.style.maxHeight).toBe('667px');
  });

  it('falls back to window.innerHeight when visualViewport is unavailable', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 768,
    });

    render(<TripExportModal {...baseProps} />);

    const panel = screen.getByTestId('trip-export-modal-panel');
    expect(panel.className).toContain('trip-export-modal-panel');
    expect(panel.style.maxHeight).toBe('768px');
  });
});
