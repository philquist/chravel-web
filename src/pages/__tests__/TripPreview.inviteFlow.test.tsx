import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import TripPreview from '../TripPreview';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const mockInvoke = vi.fn();
const mockMaybeSingle = vi.fn();
const mockJoinRequestMaybeSingle = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    setDemoView: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    from: (table: string) => {
      if (table === 'trip_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
          }),
        };
      }
      if (table === 'trip_join_requests') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => mockJoinRequestMaybeSingle(),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

describe('TripPreview invite flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        trip: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Festival Weekend',
          destination: 'Los Angeles',
          start_date: '2026-05-02',
          end_date: '2026-05-11',
          cover_image_url: null,
          trip_type: 'consumer',
          member_count: 5,
          active_invite_code: 'chravelabc123',
        },
      },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockJoinRequestMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('routes authenticated non-members through /join/:code when preview returns active invite code', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/trip/11111111-1111-4111-8111-111111111111/preview']}>
        <Routes>
          <Route path="/trip/:tripId/preview" element={<TripPreview />} />
          <Route path="/join/:token" element={<div>Join Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', {
      name: /join this trip|request to join/i,
    });
    await user.click(joinButton);

    await waitFor(() => {
      expect(screen.getByText('Join Route')).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith('get-trip-preview', {
      body: { tripId: '11111111-1111-4111-8111-111111111111', ensureInvite: false },
    });
  });

  it('treats left memberships as rejoin flows instead of open-trip access', async () => {
    const user = userEvent.setup();

    mockMaybeSingle.mockResolvedValue({
      data: { id: 'member-1', status: 'left' },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/trip/11111111-1111-4111-8111-111111111111/preview']}>
        <Routes>
          <Route path="/trip/:tripId/preview" element={<TripPreview />} />
          <Route path="/join/:token" element={<div>Join Route</div>} />
          <Route path="/trip/:tripId" element={<div>Trip Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', {
      name: /join this trip|request to join/i,
    });
    await user.click(joinButton);

    await waitFor(() => {
      expect(screen.getByText('Join Route')).toBeInTheDocument();
    });

    expect(screen.queryByText('Trip Route')).not.toBeInTheDocument();
  });

  it('supports branded /t/:tripId path and still routes non-members through /join/:code', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/t/11111111-1111-4111-8111-111111111111']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPreview />} />
          <Route path="/join/:token" element={<div>Join Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', {
      name: /join this trip|request to join/i,
    });
    await user.click(joinButton);

    await waitFor(() => {
      expect(screen.getByText('Join Route')).toBeInTheDocument();
    });
  });

  it('keeps preview read-only when no invite code is available for a non-member', async () => {
    const user = userEvent.setup();

    mockInvoke.mockResolvedValueOnce({
      data: {
        success: true,
        trip: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Festival Weekend',
          destination: 'Los Angeles',
          start_date: '2026-05-02',
          end_date: '2026-05-11',
          cover_image_url: null,
          trip_type: 'consumer',
          member_count: 5,
          active_invite_code: null,
        },
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/trip/11111111-1111-4111-8111-111111111111/preview']}>
        <Routes>
          <Route path="/trip/:tripId/preview" element={<TripPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', {
      name: /join this trip|request to join/i,
    });
    await user.click(joinButton);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        'Ask the organizer for an invite link to join this trip.',
      );
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('routes non-members with pending requests back to home status view', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      data: {
        success: true,
        trip: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Festival Weekend',
          destination: 'Los Angeles',
          start_date: '2026-05-02',
          end_date: '2026-05-11',
          cover_image_url: null,
          trip_type: 'consumer',
          member_count: 5,
          active_invite_code: null,
        },
      },
      error: null,
    });
    mockJoinRequestMaybeSingle.mockResolvedValue({
      data: { status: 'pending' },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/trip/11111111-1111-4111-8111-111111111111/preview']}>
        <Routes>
          <Route path="/trip/:tripId/preview" element={<TripPreview />} />
          <Route path="/" element={<div>Home Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const statusButton = await screen.findByRole('button', { name: /view request status/i });
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Home Route')).toBeInTheDocument();
    });
  });

  it('surfaces a toast when membership or join-request checks fail instead of mis-routing', async () => {
    const user = userEvent.setup();

    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'network', code: 'PGRST301' },
    });
    mockJoinRequestMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(
      <MemoryRouter initialEntries={['/trip/11111111-1111-4111-8111-111111111111/preview']}>
        <Routes>
          <Route path="/trip/:tripId/preview" element={<TripPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    const joinButton = await screen.findByRole('button', {
      name: /join this trip|request to join/i,
    });
    await user.click(joinButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not verify trip access. Check your connection and try again.',
      );
    });
  });
});
