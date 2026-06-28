import { describe, expect, it } from 'vitest';
import { canRoleAccess } from '@/lib/permissionGuard';

interface ServerPermissionsPayload {
  role: string;
  trip_type: string;
  can_create_task: boolean;
  can_edit_task: boolean;
  can_delete_task: boolean;
  can_create_poll: boolean;
  can_close_poll: boolean;
  can_delete_poll: boolean;
  can_create_event: boolean;
  can_edit_event: boolean;
  can_delete_event: boolean;
  can_set_basecamp: boolean;
  can_save_link: boolean;
}

/** Mirrors get_trip_mutation_permissions RPC output shape for client parity tests. */
export function mapServerPermissions(payload: ServerPermissionsPayload) {
  return {
    tripType: payload.trip_type as 'consumer' | 'pro' | 'event',
    canCreateTask: payload.can_create_task,
    canEditTask: payload.can_edit_task,
    canDeleteTask: payload.can_delete_task,
    canCreatePoll: payload.can_create_poll,
    canClosePoll: payload.can_close_poll,
    canDeletePoll: payload.can_delete_poll,
    canCreateEvent: payload.can_create_event,
    canEditEvent: payload.can_edit_event,
    canDeleteEvent: payload.can_delete_event,
    canSetBasecamp: payload.can_set_basecamp,
    canSaveLink: payload.can_save_link,
  };
}

export function buildClientPermissionsFromRole(
  role: Parameters<typeof canRoleAccess>[0],
  tripType: 'consumer' | 'pro' | 'event',
) {
  return {
    tripType,
    canCreateTask: canRoleAccess(role, 'tasks', 'write'),
    canEditTask: canRoleAccess(role, 'tasks', 'write'),
    canDeleteTask: canRoleAccess(role, 'tasks', 'delete'),
    canCreatePoll: canRoleAccess(role, 'polls', 'write'),
    canClosePoll: canRoleAccess(role, 'polls', 'admin'),
    canDeletePoll: canRoleAccess(role, 'polls', 'delete'),
    canCreateEvent: canRoleAccess(role, 'calendar', 'write'),
    canEditEvent: canRoleAccess(role, 'calendar', 'write'),
    canDeleteEvent: canRoleAccess(role, 'calendar', 'delete'),
    canSetBasecamp: canRoleAccess(role, 'basecamp', 'admin'),
    canSaveLink: canRoleAccess(role, 'links', 'write'),
  };
}

describe('trip mutation permission parity', () => {
  it('event attendee is read-only for tasks/calendar/basecamp', () => {
    const perms = buildClientPermissionsFromRole('event_attendee', 'event');
    expect(perms.canCreateTask).toBe(false);
    expect(perms.canCreateEvent).toBe(false);
    expect(perms.canSetBasecamp).toBe(false);
    expect(perms.canCreatePoll).toBe(false);
  });

  it('pro viewer cannot mutate tasks or calendar', () => {
    const perms = buildClientPermissionsFromRole('pro_viewer', 'pro');
    expect(perms.canCreateTask).toBe(false);
    expect(perms.canCreateEvent).toBe(false);
    expect(perms.canCreatePoll).toBe(true);
  });

  it('maps snake_case RPC payload to camelCase UI flags', () => {
    const mapped = mapServerPermissions({
      role: 'pro_admin',
      trip_type: 'pro',
      can_create_task: true,
      can_edit_task: true,
      can_delete_task: true,
      can_create_poll: true,
      can_close_poll: true,
      can_delete_poll: true,
      can_create_event: true,
      can_edit_event: true,
      can_delete_event: true,
      can_set_basecamp: true,
      can_save_link: true,
    });
    expect(mapped.canCreateTask).toBe(true);
    expect(mapped.tripType).toBe('pro');
  });
});
