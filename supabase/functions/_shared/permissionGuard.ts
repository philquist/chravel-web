import {
  PERMISSION_MATRIX,
  type PermissionAction,
  type PermissionResource,
  type PermissionRole,
} from './permissionMatrix.generated.ts';

export function assertRoleAccess(
  role: PermissionRole,
  resource: PermissionResource,
  action: PermissionAction,
): void {
  const roleRules = PERMISSION_MATRIX[role];
  const resourceRule = roleRules[resource] ?? roleRules['*'];
  if (!resourceRule || resourceRule[action] !== true) {
    throw new Error(`PERMISSION_DENIED:${role}:${resource}:${action}`);
  }
}
