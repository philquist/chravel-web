import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ProParticipant } from '../../../types/pro';
import { TeamMemberCard } from './TeamMemberCard';

// Estimate only — actual row height is measured post-render via virtualizer.measureElement,
// since card height varies with phone/medical/dietary/role-pill-wrap content.
const ROW_HEIGHT_ESTIMATE = 136;
const COLS_DESKTOP = 4;
const COLS_MOBILE = 1;

interface VirtualizedRosterGridProps {
  members: ProParticipant[];
  memberRolesMap: Map<string, string[]>;
  adminUserIds: Set<string>;
  coordinatorUserIds: Set<string>;
  isMobile: boolean;
}

export const VirtualizedRosterGrid: React.FC<VirtualizedRosterGridProps> = ({
  members,
  memberRolesMap,
  adminUserIds,
  coordinatorUserIds,
  isMobile,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = isMobile ? COLS_MOBILE : COLS_DESKTOP;
  const rowCount = Math.ceil(members.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 2,
  });

  const getRolePills = (member: ProParticipant) => {
    const memberUserId = member.userId ?? member.id;
    const isAdminMember = memberUserId ? adminUserIds.has(memberUserId) : false;
    const isCoordinatorMember = memberUserId ? coordinatorUserIds.has(memberUserId) : false;
    const assignedRoles = memberUserId ? memberRolesMap.get(memberUserId) || [] : [];
    const allRolePills: { name: string; isAdmin: boolean; isCoordinator?: boolean }[] = [];
    if (isAdminMember) {
      allRolePills.push({ name: 'admin', isAdmin: true });
    } else if (isCoordinatorMember) {
      allRolePills.push({ name: 'coordinator', isAdmin: false, isCoordinator: true });
    }
    const sortedRoles = [...assignedRoles].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    sortedRoles.forEach(roleName => {
      if (roleName.toLowerCase() !== 'admin') {
        allRolePills.push({ name: roleName, isAdmin: false });
      }
    });
    const showFallbackRole =
      assignedRoles.length === 0 &&
      member.role &&
      member.role !== '' &&
      member.role !== 'Member' &&
      member.role !== 'Participant' &&
      member.role.toLowerCase() !== 'admin';
    return { allRolePills, showFallbackRole };
  };

  return (
    <div
      ref={parentRef}
      className="h-[500px] overflow-auto overflow-x-hidden"
      style={{ contain: 'strict' }}
      role="grid"
      aria-label="Team roster grid"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const startIdx = virtualRow.index * cols;
          const rowMembers = members.slice(startIdx, startIdx + cols);
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
            >
              {rowMembers.map(member => {
                const { allRolePills, showFallbackRole } = getRolePills(member);
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
          );
        })}
      </div>
    </div>
  );
};
