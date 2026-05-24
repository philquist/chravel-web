import {
  PERMISSION_MATRIX,
  type PermissionAction,
  type PermissionResource,
  type PermissionRole,
} from '@/types/permissionMatrix.generated';

export function canRoleAccess(
  role: PermissionRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const roleRules = PERMISSION_MATRIX[role];
  const resourceRule = roleRules[resource] ?? roleRules['*'];
  if (!resourceRule) return false;
  return resourceRule[action] === true;
}
