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

  it('keeps Create Role, Manage Roles, and Requests on one text-only row', () => {
    render(
      <RolesView
        roster={[]}
        userRole="admin"
        category="sports"
        canManageRoles
        onCreateRole={vi.fn()}
        isLoadingRoles={false}
        adminLoading={false}
        tripId="22be43ef-270d-4c99-9b53-b3541d5c82ef"
        tripCreatorId="013d9240-10c0-44e5-8da5-abfa2c4751c5"
        availableRoles={[]}
      />,
    );

    const createRole = screen.getByRole('button', { name: /^create role$/i });
    const manageRoles = screen.getByRole('button', { name: /^manage roles$/i });
    const requests = screen.getByRole('button', { name: /^requests$/i });

    expect(createRole).toBeEnabled();
    expect(manageRoles).toBeInTheDocument();
    expect(requests).toBeInTheDocument();

    // Text-only pills — no lucide SVG icons inside the three primary actions.
    expect(createRole.querySelector('svg')).toBeNull();
    expect(manageRoles.querySelector('svg')).toBeNull();
    expect(requests.querySelector('svg')).toBeNull();

    const row = createRole.parentElement;
    expect(row).not.toBeNull();
    expect(row?.className).toMatch(/flex-nowrap/);
    expect(row).toContainElement(manageRoles);
    expect(row).toContainElement(requests);
  });

  it('lays out Team, member count, and Admin Access on one symmetric row without the glyph', () => {
    render(
      <RolesView
        roster={[]}
        userRole="admin"
        category="sports"
        canManageRoles
        onCreateRole={vi.fn()}
        isLoadingRoles={false}
        adminLoading={false}
        tripId="22be43ef-270d-4c99-9b53-b3541d5c82ef"
        tripCreatorId="013d9240-10c0-44e5-8da5-abfa2c4751c5"
        availableRoles={[]}
      />,
    );

    const headerRow = screen.getByTestId('team-header-row');
    expect(headerRow.className).toMatch(/grid-cols-3/);

    // Sports category uses "Team Roster" as the section title (not bare "Team").
    const heading = screen.getByRole('heading', { name: /team roster/i });
    expect(headerRow).toContainElement(heading);
    // No Users glyph in the header (redundant with the Team tab icon).
    expect(headerRow.querySelector('svg')).toBeNull();
    expect(headerRow).toHaveTextContent(/0 members/);
    expect(headerRow).toHaveTextContent(/admin access/i);
  });
});
