import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventCard } from '../EventCard';
import type { EventData } from '@/types/events';

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

vi.mock('@/hooks/useDeleteTrip', () => ({
  useDeleteTrip: () => ({ deleteTrip: vi.fn(), isDeleting: false }),
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

const baseEvent = {
  id: 'event-1',
  title: 'Community Festival',
  location: 'Austin, TX',
  dateRange: 'Aug 1 - Aug 3, 2026',
  category: 'Festival',
  description: 'Outdoor event',
  tags: [],
  capacity: 500,
  registrationStatus: 'open',
  attendanceExpected: 250,
  groupChatEnabled: true,
  coverPhoto: 'https://example.com/event-cover.jpg',
} as EventData;

describe('EventCard cover display mode', () => {
  it('uses object-contain when coverDisplayMode is contain', () => {
    render(<EventCard event={{ ...baseEvent, coverDisplayMode: 'contain' }} />);

    const img = screen.getByAltText('Community Festival cover');
    expect(img.className).toContain('object-contain');
  });

  it('uses object-cover when coverDisplayMode is cover', () => {
    render(<EventCard event={{ ...baseEvent, coverDisplayMode: 'cover' }} />);

    const img = screen.getByAltText('Community Festival cover');
    expect(img.className).toContain('object-cover');
  });
});
