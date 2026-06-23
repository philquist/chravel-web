import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProTripCard } from '../ProTripCard';
import type { ProTripData } from '@/types/pro';

vi.mock('../OptimizedImage', () => ({
  OptimizedImage: ({ fit, alt }: { fit?: 'cover' | 'contain'; alt: string }) => (
    <img alt={alt} className={fit === 'contain' ? 'object-contain' : 'object-cover'} />
  ),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useProTrips', () => ({
  useProTrips: () => ({
    archiveTrip: vi.fn(),
    hideTrip: vi.fn(),
    deleteTripForMe: vi.fn(),
  }),
}));

vi.mock('@/store/demoTripMembersStore', () => ({
  useDemoTripMembersStore: () => [],
}));

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../ArchiveConfirmDialog', () => ({ ArchiveConfirmDialog: () => null }));
vi.mock('../DeleteTripConfirmDialog', () => ({ DeleteTripConfirmDialog: () => null }));
vi.mock('../InviteModal', () => ({ InviteModal: () => null }));
vi.mock('../share/ShareTripModal', () => ({ ShareTripModal: () => null }));
vi.mock('../trip/LazyTripExportModal', () => ({ LazyTripExportModal: () => null }));

const baseTrip = {
  id: 'pro-trip-1',
  title: 'Summer Tour',
  description: 'Arena run',
  location: 'Los Angeles, CA',
  dateRange: 'Jul 1 - Jul 10, 2026',
  coverPhoto: 'https://example.com/pro-cover.jpg',
  tags: [],
  participants: [],
} as ProTripData;

describe('ProTripCard cover display mode', () => {
  it('uses object-contain when coverDisplayMode is contain', () => {
    render(<ProTripCard trip={{ ...baseTrip, coverDisplayMode: 'contain' }} />);

    const img = screen.getByAltText('Summer Tour cover');
    expect(img.className).toContain('object-contain');
  });

  it('uses object-cover when coverDisplayMode is cover', () => {
    render(<ProTripCard trip={{ ...baseTrip, coverDisplayMode: 'cover' }} />);

    const img = screen.getByAltText('Summer Tour cover');
    expect(img.className).toContain('object-cover');
  });
});
