import React, { useState, useMemo } from 'react';
import { Users, LayoutGrid, Network, ShieldCheck } from 'lucide-react';
import { ProParticipant, TeamTripContext } from '../../../types/pro';
import { ProTripCategory, getCategoryConfig } from '../../../types/proCategories';
import { TeamOnboardingBanner } from '../TeamOnboardingBanner';
import { BulkRoleAssignmentModal } from '../BulkRoleAssignmentModal';
import { RoleContactSheet } from '../RoleContactSheet';
import { extractUniqueRoles, MAX_ROLES_PER_TRIP } from '../../../utils/roleUtils';
import { Button } from '../../ui/button';
import { useDemoMode } from '../../../hooks/useDemoMode';
import { useSuperAdmin } from '../../../hooks/useSuperAdmin';
import { useIsMobile } from '../../../hooks/use-mobile';
import { JoinRequestsDialog } from '../admin/JoinRequestsDialog';
import { RoleManagerDialog } from '../admin/RoleManagerDialog';
import { CoordinatorInviteDialog } from '../admin/CoordinatorInviteDialog';
import { TeamOrgChart } from '../TeamOrgChart';
import { VirtualizedRosterGrid } from './VirtualizedRosterGrid';
import { TeamMemberCard } from './TeamMemberCard';
import { TripRole } from '../../../types/roleChannels';
import { useRoleAssignments } from '../../../hooks/useRoleAssignments';
import { useTripAdmins } from '../../../hooks/useTripAdmins';
import { useFeatureFlag } from '../../../lib/featureFlags';

interface RolesViewProps {
  roster: ProParticipant[];
  userRole: string;
  isReadOnly?: boolean;
  category: ProTripCategory;
  /** Callback receives memberId, roleId (for DB), and roleName (for display/local state) */
  onUpdateMemberRole?: (memberId: string, roleId: string, roleName: string) => Promise<void>;
  canManageRoles?: boolean;
  onCreateRole?: () => void;
  isLoadingRoles?: boolean;
  adminLoading?: boolean;
  isLoadingRoster?: boolean;
  tripId?: string;
  tripCreatorId?: string;
  trip?: TeamTripContext;
  availableRoles?: TripRole[];
}

export const RolesView = ({
  roster,
  userRole,
  isReadOnly = false,
  category,
  onUpdateMemberRole,
  canManageRoles = false,
  onCreateRole,
  isLoadingRoles = false,
  adminLoading: _adminLoading = false,
  isLoadingRoster = false,
  tripId,
  tripCreatorId,
  trip: _trip,
  availableRoles = [],
}: RolesViewProps) => {
  const { isDemoMode } = useDemoMode();
  const { isSuperAdmin } = useSuperAdmin();
  const isMobile = useIsMobile();
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [roleContactSheet, setRoleContactSheet] = useState<{
    role: string;
    members: ProParticipant[];
  } | null>(null);
  const [showRequestsDialog, setShowRequestsDialog] = useState(false);
  const [showRoleManagerDialog, setShowRoleManagerDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'orgchart'>('grid');
  const [showCoordinatorDialog, setShowCoordinatorDialog] = useState(false);
  const coordinatorRoleEnabled = useFeatureFlag('pro_coordinator_role', false);

  // Fetch role assignments and admins to display role pills per member
  const { assignments } = useRoleAssignments({ tripId: tripId || '', enabled: !!tripId });
  const { admins } = useTripAdmins({ tripId: tripId || '', enabled: !!tripId });

  // Create a map of userId -> array of assigned role names
  const memberRolesMap = useMemo(() => {
    const map = new Map<string, string[]>();

    // Add roles from assignments
    assignments.forEach(assignment => {
      const userId = assignment.user_id;
      const roleName = assignment.role?.roleName;
      if (userId && roleName) {
        const existing = map.get(userId) || [];
        if (!existing.includes(roleName)) {
          existing.push(roleName);
        }
        map.set(userId, existing);
      }
    });

    return map;
  }, [assignments]);

  // Create a set of full-admin user IDs and a separate set for coordinator-scope admins,
  // so the roster can render distinct pills.
  const adminUserIds = useMemo(() => {
    return new Set(admins.filter(a => a.admin_scope === 'full').map(a => a.user_id));
  }, [admins]);
  const coordinatorUserIds = useMemo(() => {
    return new Set(admins.filter(a => a.admin_scope === 'coordinator').map(a => a.user_id));
  }, [admins]);

  // Super admins are never in read-only mode
  const effectiveIsReadOnly = isSuperAdmin ? false : isReadOnly;

  const {
    terminology: { teamLabel },
  } = getCategoryConfig(category);

  // Use dynamic roles if available, otherwise fallback to existing behavior
  const roles = useMemo(
    () =>
      availableRoles.length > 0
        ? ['all', ...availableRoles.map(r => r.roleName)]
        : ['all', ...extractUniqueRoles(roster)],
    [availableRoles, roster],
  );

  const existingRoles = extractUniqueRoles(roster);

  // Reset selected role filter if the role was deleted
  React.useEffect(() => {
    if (selectedRole !== 'all' && !roles.includes(selectedRole)) {
      setSelectedRole('all');
    }
  }, [roles, selectedRole]);

  // Check if there are unassigned roles (members with default/empty roles)
  const hasUnassignedRoles = roster.some(
    member =>
      !member.role ||
      member.role === '' ||
      member.role === 'Member' ||
      member.role === 'Participant',
  );

  // Filter roster by selected role - use actual role assignments from memberRolesMap
  const filteredRoster = useMemo(() => {
    if (selectedRole === 'all') return roster;

    return roster.filter(member => {
      const memberUserId = member.userId || member.id;
      const assignedRoles = memberUserId ? memberRolesMap.get(memberUserId) || [] : [];

      // Check if member is assigned to the selected role via user_trip_roles
      const hasAssignedRole = assignedRoles.includes(selectedRole);

      // Fallback: also check legacy member.role field for backwards compatibility
      const hasLegacyRole = member.role === selectedRole;

      return hasAssignedRole || hasLegacyRole;
    });
  }, [selectedRole, roster, memberRolesMap]);

  const handleAssignRolesClick = () => {
    // Open the role manager dialog instead of the per-member modal
    setShowRoleManagerDialog(true);
    setShowOnboarding(false);
  };

  // Super admins are always treated as admins
  const isAdmin =
    isSuperAdmin || userRole === 'admin' || userRole === 'tour manager' || userRole === 'manager';

  // Shared chrome for the admin action row — equal-width text pills on one
  // row (no icons) so Create / Manage / Requests never wrap into an orphan
  // full-width pill on mobile.
  const adminActionButtonClass = `${isMobile ? 'flex-1 min-w-0' : ''} justify-center rounded-xl bg-black/60 hover:bg-white/10 hover:text-gold-light hover:border-primary/40 text-white border-white/20 transition-colors min-h-[42px] px-2 sm:px-3 text-xs whitespace-nowrap`;

  return (
    <div className="space-y-6">
      {/* Onboarding Banner */}
      {showOnboarding && hasUnassignedRoles && !effectiveIsReadOnly && (
        <TeamOnboardingBanner
          hasUnassignedRoles={hasUnassignedRoles}
          onAssignRoles={handleAssignRolesClick}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Read-only notice - Never shown for super admins */}
      {effectiveIsReadOnly && !isDemoMode && !isSuperAdmin && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <p className="text-yellow-400 text-sm">Read-only access for your role</p>
        </div>
      )}

      {/* Header with Stats and Admin Indicator */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 space-y-4">
        {/* Symmetric header: Team | member count | Admin Access (or blank) */}
        <div className="grid grid-cols-3 items-center gap-2" data-testid="team-header-row">
          <h2 className="text-lg font-bold text-white truncate text-left min-w-0">{teamLabel}</h2>
          <span className="text-ink-3 text-sm text-center tabular-nums whitespace-nowrap">
            {roster.length} {roster.length === 1 ? 'member' : 'members'}
          </span>
          <div className="flex justify-end min-h-[24px] min-w-0">
            {(canManageRoles || isSuperAdmin) && !effectiveIsReadOnly ? (
              <span className="flex-shrink-0 text-[11px] font-medium text-gold-light bg-primary/10 border border-primary/25 rounded-full px-2.5 py-1">
                Admin Access
              </span>
            ) : null}
          </div>
        </div>

        {/* Admin action buttons — single row of equal-width text pills */}
        {(canManageRoles || isSuperAdmin) && !effectiveIsReadOnly && (
          <div className="flex flex-nowrap gap-1.5">
            <Button
              onClick={onCreateRole}
              // Visible only when canManageRoles is already true — do not gate on
              // adminLoading or isLoadingRoles (both used to leave this greyed out
              // forever when a roles/admin fetch hung). Cap is enforced here only
              // after the list has loaded; CreateRoleDialog also validates on submit.
              disabled={!isLoadingRoles && availableRoles.length >= MAX_ROLES_PER_TRIP}
              variant="outline"
              size="sm"
              className={adminActionButtonClass}
            >
              Create Role
            </Button>
            <Button
              onClick={() => setShowRoleManagerDialog(true)}
              variant="outline"
              size="sm"
              className={adminActionButtonClass}
              title="Manage roles, assignments, and admins"
            >
              Manage Roles
            </Button>
            <Button
              onClick={() => setShowRequestsDialog(true)}
              variant="outline"
              size="sm"
              className={adminActionButtonClass}
              title="View join requests"
            >
              Requests
            </Button>
            {coordinatorRoleEnabled && tripId && (
              <Button
                onClick={() => setShowCoordinatorDialog(true)}
                variant="outline"
                size="sm"
                className={adminActionButtonClass}
                title="Grant logistics-only access to an outside organizer"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1 shrink-0" />
                Coordinator
              </Button>
            )}
          </div>
        )}

        {/* View mode toggle + Role Filter Pills */}
        <div
          className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between gap-4'}`}
        >
          <div className={`flex items-center gap-2 ${isMobile ? 'justify-center' : 'shrink-0'}`}>
            <span className="text-xs text-ink-3">View:</span>
            <div className="flex rounded-xl bg-white/5 border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${
                  viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-ink-3 hover:text-white'
                }`}
              >
                <LayoutGrid size={14} />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('orgchart')}
                aria-label="Org chart view"
                aria-pressed={viewMode === 'orgchart'}
                className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${
                  viewMode === 'orgchart' ? 'bg-white/15 text-white' : 'text-ink-3 hover:text-white'
                }`}
              >
                <Network size={14} />
                Org Chart
              </button>
            </div>
          </div>

          {isLoadingRoles ? (
            <div className="flex gap-2 items-center">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 w-20 rounded-full bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            (availableRoles.length > 0 || existingRoles.length > 0) && (
              <div
                className={`flex flex-wrap gap-1.5 items-center ${isMobile ? 'justify-center' : 'justify-end'}`}
              >
                {roles.map(role => {
                  // Count members assigned to this role from actual role assignments (memberRolesMap)
                  const assignmentCount = Array.from(memberRolesMap.values()).filter(roleNames =>
                    roleNames.includes(role),
                  ).length;

                  // Check if this is a role from availableRoles (modern system) or legacy
                  const roleFromAvailable = availableRoles.find(r => r.roleName === role);

                  // Fallback: count members with legacy role field for backwards compatibility
                  const legacyRoleMembers = roster.filter(m => m.role === role);

                  // Use assignment count if role exists in availableRoles, otherwise use legacy count
                  const memberCount = roleFromAvailable
                    ? assignmentCount
                    : legacyRoleMembers.length;

                  // Always show 'all', and for other roles show if they exist in availableRoles or have legacy members
                  const shouldShow =
                    role === 'all' ||
                    availableRoles.some(r => r.roleName === role) ||
                    legacyRoleMembers.length > 0;

                  if (!shouldShow) return null;

                  return (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      aria-label={`Filter by ${role === 'all' ? 'all roles' : `role ${role}`}${role !== 'all' ? `, ${memberCount} members` : ''}`}
                      aria-pressed={selectedRole === role}
                      className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1.5 min-h-[44px] rounded-full text-xs font-medium transition-colors duration-200 ${
                        selectedRole === role
                          ? 'bg-gold-primary text-black shadow-ring-glow'
                          : 'bg-white/5 text-ink-2 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {role === 'all' ? 'All' : role}
                      {role !== 'all' && (
                        <span className="ml-1 text-xs opacity-75">{memberCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Manual Role Input Notice for Corporate & Business */}
        {availableRoles.length === 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-gold-mid/80 text-sm">
              Team members can have custom titles entered manually.{' '}
              {isAdmin && 'Use the "Create Role" button above to add new roles.'}
            </p>
          </div>
        )}
      </div>

      {/* Team content: Grid or Org Chart */}
      {isLoadingRoster ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 animate-pulse">
              <div className="flex gap-2.5">
                <div className="w-10 h-10 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/10 rounded w-1/2" />
                  <div className="h-3 bg-white/10 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'orgchart' ? (
        <TeamOrgChart roster={filteredRoster} category={category} onMemberClick={() => {}} />
      ) : filteredRoster.length > 50 ? (
        <VirtualizedRosterGrid
          members={filteredRoster}
          memberRolesMap={memberRolesMap}
          adminUserIds={adminUserIds}
          coordinatorUserIds={coordinatorUserIds}
          isMobile={isMobile}
        />
      ) : (
        <>
          <div
            className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}
          >
            {filteredRoster.map(member => {
              // Get all roles for this member: admin status + assigned roles
              // Fall back to member.id when userId is absent (e.g., demo/mock data stores user ID in id)
              const memberUserId = member.userId || member.id;
              const isAdminMember = memberUserId ? adminUserIds.has(memberUserId) : false;
              const isCoordinatorMember = memberUserId
                ? coordinatorUserIds.has(memberUserId)
                : false;
              const assignedRoles = memberUserId ? memberRolesMap.get(memberUserId) || [] : [];

              // Combine roles: admin/coordinator first, then assigned roles sorted alphabetically
              const allRolePills: { name: string; isAdmin: boolean; isCoordinator?: boolean }[] =
                [];

              if (isAdminMember) {
                allRolePills.push({ name: 'admin', isAdmin: true });
              } else if (isCoordinatorMember) {
                allRolePills.push({ name: 'coordinator', isAdmin: false, isCoordinator: true });
              }

              // Add assigned roles (sorted alphabetically, case-insensitive)
              const sortedRoles = [...assignedRoles].sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase()),
              );
              sortedRoles.forEach(roleName => {
                // Avoid duplicating if somehow "admin" is also an assigned role
                if (roleName.toLowerCase() !== 'admin') {
                  allRolePills.push({ name: roleName, isAdmin: false });
                }
              });

              // Fallback to member.role if no assigned roles (ignore admin pill for this check)
              // Also exclude 'admin' from fallback to prevent duplicate admin pills
              const showFallbackRole =
                assignedRoles.length === 0 &&
                member.role &&
                member.role !== '' &&
                member.role !== 'Member' &&
                member.role !== 'Participant' &&
                member.role.toLowerCase() !== 'admin';

              return (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  rolePills={allRolePills}
                  fallbackRole={showFallbackRole ? member.role : null}
                />
              );
            })}
          </div>

          {filteredRoster.length === 0 && (
            <div className="text-center py-12">
              <Users size={48} className="text-ink-3 mx-auto mb-4" />
              <p className="text-ink-3 mb-3">No team members found for the selected role.</p>
              {selectedRole !== 'all' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRole('all')}
                  className="text-gold-mid border-primary/30 hover:bg-primary/10"
                >
                  Show all members
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Bulk Role Assignment Modal */}
      {onUpdateMemberRole && (
        <BulkRoleAssignmentModal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          roster={roster}
          category={category}
          existingRoles={existingRoles}
          availableRoles={availableRoles}
          onUpdateMemberRole={onUpdateMemberRole}
        />
      )}

      {/* Role Contact Sheet */}
      {roleContactSheet && (
        <RoleContactSheet
          isOpen={true}
          onClose={() => setRoleContactSheet(null)}
          role={roleContactSheet.role}
          members={roleContactSheet.members}
          category={category}
        />
      )}

      {/* Join Requests and Role Manager Dialogs */}
      {tripId && tripCreatorId && (
        <>
          <JoinRequestsDialog
            open={showRequestsDialog}
            onOpenChange={setShowRequestsDialog}
            tripId={tripId}
          />
          <RoleManagerDialog
            open={showRoleManagerDialog}
            onOpenChange={setShowRoleManagerDialog}
            tripId={tripId}
            tripCreatorId={tripCreatorId}
          />
        </>
      )}

      {tripId && coordinatorRoleEnabled && (
        <CoordinatorInviteDialog
          open={showCoordinatorDialog}
          onOpenChange={setShowCoordinatorDialog}
          tripId={tripId}
          roster={roster}
        />
      )}
    </div>
  );
};
