import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileEventCard } from '../MobileEventCard';
import type { EventData } from '@/types/events';

const mockNavigate = vi.fn();

vi.mock('../OptimizedImage', () => ({
  OptimizedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
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

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../ArchiveConfirmDialog', () => ({ ArchiveConfirmDialog: () => null }));
vi.mock('../DeleteTripConfirmDialog', () => ({ DeleteTripConfirmDialog: () => null }));
vi.mock('../InviteModal', () => ({ InviteModal: () => null }));
vi.mock('../share/ShareTripModal', () => ({ ShareTripModal: () => null }));
vi.mock('../trip/LazyTripExportModal', () => ({ LazyTripExportModal: () => null }));

const baseEvent = {
  id: 'event-move-1',
  title: 'Moveable Event',
  location: 'Atlanta, GA',
  dateRange: 'Aug 6 - Aug 9, 2026',
  category: 'Conference',
  description: 'Test event',
  tags: [],
  capacity: 500,
  registrationStatus: 'open',
  attendanceExpected: 250,
  groupChatEnabled: true,
} as EventData;

describe('MobileEventCard move mode actions', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('shows Move Trip in the overflow menu and calls the move handler', () => {
    const onMoveTrip = vi.fn();

    render(<MobileEventCard event={baseEvent} onMoveTrip={onMoveTrip} />);

    fireEvent.click(screen.getByRole('button', { name: /event actions/i }));
    fireEvent.click(screen.getByText('Move Trip'));

    expect(onMoveTrip).toHaveBeenCalledTimes(1);
  });

  it('exits move mode instead of navigating when the View Event CTA is tapped', () => {
    const onExitMoveMode = vi.fn();

    render(<MobileEventCard event={baseEvent} reorderMode onExitMoveMode={onExitMoveMode} />);

    fireEvent.click(screen.getByRole('button', { name: /view event/i }));

    expect(onExitMoveMode).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
