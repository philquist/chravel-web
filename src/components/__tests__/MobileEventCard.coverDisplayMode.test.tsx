import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileEventCard } from '../MobileEventCard';
import type { EventData } from '@/types/events';

vi.mock('../OptimizedImage', () => ({
  OptimizedImage: ({ fit, alt }: { fit?: 'cover' | 'contain'; alt: string }) => (
    <img alt={alt} className={fit === 'contain' ? 'object-contain' : 'object-cover'} />
  ),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock('../ArchiveConfirmDialog', () => ({ ArchiveConfirmDialog: () => null }));
vi.mock('../DeleteTripConfirmDialog', () => ({ DeleteTripConfirmDialog: () => null }));
vi.mock('../InviteModal', () => ({ InviteModal: () => null }));
vi.mock('../share/ShareTripModal', () => ({ ShareTripModal: () => null }));
vi.mock('../trip/LazyTripExportModal', () => ({ LazyTripExportModal: () => null }));

const baseEvent = {
  id: 'event-mobile-1',
  title: 'Mobile Fest',
  location: 'Miami, FL',
  dateRange: 'Sep 1 - Sep 2, 2026',
  category: 'Festival',
  description: 'Mobile event card',
  tags: [],
  capacity: 200,
  registrationStatus: 'open',
  attendanceExpected: 120,
  groupChatEnabled: true,
  coverPhoto: 'https://example.com/mobile-event-cover.jpg',
} as EventData;

describe('MobileEventCard cover display mode', () => {
  it('uses object-contain when coverDisplayMode is contain', () => {
    render(<MobileEventCard event={{ ...baseEvent, coverDisplayMode: 'contain' }} />);

    const img = screen.getByAltText('Mobile Fest cover');
    expect(img.className).toContain('object-contain');
  });

  it('uses object-cover when coverDisplayMode is cover', () => {
    render(<MobileEventCard event={{ ...baseEvent, coverDisplayMode: 'cover' }} />);

    const img = screen.getByAltText('Mobile Fest cover');
    expect(img.className).toContain('object-cover');
  });
});
