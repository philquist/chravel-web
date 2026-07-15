import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RolesView } from '../RolesView';

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useSuperAdmin', () => ({
  useSuperAdmin: () => ({ isSuperAdmin: true }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

vi.mock('@/hooks/useRoleAssignments', () => ({
  useRoleAssignments: () => ({ assignments: [] }),
}));

vi.mock('@/hooks/useTripAdmins', () => ({
  useTripAdmins: () => ({ admins: [] }),
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('../../admin/JoinRequestsDialog', () => ({
  JoinRequestsDialog: () => null,
}));

vi.mock('../../admin/RoleManagerDialog', () => ({
  RoleManagerDialog: () => null,
}));

vi.mock('../../admin/CoordinatorInviteDialog', () => ({
  CoordinatorInviteDialog: () => null,
}));

vi.mock('../../TeamOrgChart', () => ({
  TeamOrgChart: () => null,
}));

vi.mock('../VirtualizedRosterGrid', () => ({
  VirtualizedRosterGrid: () => null,
}));

vi.mock('../TeamMemberCard', () => ({
  TeamMemberCard: () => null,
}));

describe('RolesView Create Role enablement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Create Role clickable while roles are still loading', () => {
    render(
      <RolesView
        roster={[]}
        userRole="admin"
        category="sports"
        canManageRoles
        onCreateRole={vi.fn()}
        isLoadingRoles
        adminLoading={false}
        tripId="22be43ef-270d-4c99-9b53-b3541d5c82ef"
        tripCreatorId="013d9240-10c0-44e5-8da5-abfa2c4751c5"
        availableRoles={[]}
      />,
    );

    const createRoleButton = screen.getByRole('button', { name: /create role/i });
    expect(createRoleButton).toBeEnabled();
  });

  it('stays clickable even while admin permissions are still resolving', () => {
    render(
      <RolesView
        roster={[]}
        userRole="admin"
        category="sports"
        canManageRoles
        onCreateRole={vi.fn()}
        isLoadingRoles={false}
        adminLoading
        tripId="22be43ef-270d-4c99-9b53-b3541d5c82ef"
        tripCreatorId="013d9240-10c0-44e5-8da5-abfa2c4751c5"
        availableRoles={[]}
      />,
    );

    const createRoleButton = screen.getByRole('button', { name: /create role/i });
    expect(createRoleButton).toBeEnabled();
  });
});
