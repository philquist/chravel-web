import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JoinRequestsPanel } from '../JoinRequestsPanel';

const refetch = vi.fn();

vi.mock('@/hooks/useJoinRequests', () => ({
  useJoinRequests: () => ({
    requests: [],
    isLoading: false,
    isError: true,
    isProcessing: false,
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    refetch,
  }),
}));

vi.mock('@/hooks/useDashboardJoinRequests', () => ({
  getJoinRequestDisplayLabel: () => 'Requested',
}));

describe('JoinRequestsPanel error state', () => {
  beforeEach(() => {
    refetch.mockClear();
  });

  it('shows retry UI instead of an infinite Loading requests spinner when fetch fails', () => {
    render(<JoinRequestsPanel tripId="trip-1" />);

    expect(screen.queryByText(/loading requests/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not load requests/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
