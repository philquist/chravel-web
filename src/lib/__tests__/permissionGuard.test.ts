import { describe, expect, it } from 'vitest';
import { canRoleAccess } from '@/lib/permissionGuard';

describe('permissionGuard matrix', () => {
  it('enforces deny-by-default for undefined combinations', () => {
    expect(canRoleAccess('event_attendee', 'basecamp', 'admin')).toBe(false);
  });

  it('allows high-risk actions only for privileged roles', () => {
    expect(canRoleAccess('pro_admin', 'tasks', 'read')).toBe(true);
    expect(canRoleAccess('pro_admin', 'tasks', 'write')).toBe(true);
    expect(canRoleAccess('pro_admin', 'tasks', 'delete')).toBe(true);
    expect(canRoleAccess('pro_admin', 'tasks', 'admin')).toBe(true);

    expect(canRoleAccess('pro_editor', 'tasks', 'delete')).toBe(true);
    expect(canRoleAccess('pro_editor', 'tasks', 'admin')).toBe(false);

    expect(canRoleAccess('pro_viewer', 'tasks', 'write')).toBe(false);
    expect(canRoleAccess('consumer_guest', 'tasks', 'read')).toBe(false);
  });
});
