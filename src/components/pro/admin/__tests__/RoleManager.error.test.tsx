import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleManager } from '../RoleManager';

const refetchRoles = vi.fn();

vi.mock('@/hooks/useTripRoles', () => ({
  useTripRoles: () => ({
    roles: [],
    isLoading: false,
    isError: true,
    isProcessing: false,
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    refetch: refetchRoles,
  }),
}));

vi.mock('@/hooks/useRoleAssignments', () => ({
  useRoleAssignments: () => ({
    assignments: [],
    assignRole: vi.fn(),
    removeRole: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTripMembers', () => ({
  useTripMembers: () => ({
    tripMembers: [],
    loading: false,
    tripCreatorId: 'creator-1',
  }),
}));

vi.mock('@/hooks/useTripAdmins', () => ({
  useTripAdmins: () => ({
    admins: [],
    isLoading: false,
    isProcessing: false,
    promoteToAdmin: vi.fn(),
    demoteFromAdmin: vi.fn(),
  }),
}));

describe('RoleManager error state', () => {
  beforeEach(() => {
    refetchRoles.mockClear();
  });

  it('shows retry UI instead of an infinite Loading roles spinner when fetch fails', () => {
    render(<RoleManager tripId="trip-1" tripCreatorId="creator-1" />);

    expect(screen.queryByText(/loading roles/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not load roles/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetchRoles).toHaveBeenCalled();
  });
});
