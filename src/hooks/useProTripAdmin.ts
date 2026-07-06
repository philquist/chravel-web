import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';

export type AdminScope = 'full' | 'coordinator';

export interface AdminPermissions {
  can_manage_roles: boolean;
  can_manage_channels: boolean;
  can_designate_admins: boolean;
  can_manage_shared_calendar: boolean;
  can_manage_shared_tasks: boolean;
  can_manage_shared_places: boolean;
  can_manage_shared_files: boolean;
  can_manage_shared_links: boolean;
  can_invite_members: boolean;
}

interface TripAdminPermissionsResult {
  is_admin: boolean;
  admin_scope: AdminScope | null;
  can_manage_roles: boolean;
  can_manage_channels: boolean;
  can_designate_admins: boolean;
  can_manage_shared_calendar: boolean;
  can_manage_shared_tasks: boolean;
  can_manage_shared_places: boolean;
  can_manage_shared_files: boolean;
  can_manage_shared_links: boolean;
  can_invite_members: boolean;
}

const DEMO_PERMISSIONS: AdminPermissions = {
  can_manage_roles: true,
  can_manage_channels: true,
  can_designate_admins: true,
  can_manage_shared_calendar: true,
  can_manage_shared_tasks: true,
  can_manage_shared_places: true,
  can_manage_shared_files: true,
  can_manage_shared_links: true,
  can_invite_members: true,
};

/**
 * Hook to check Pro trip admin status and permissions.
 * Admin status is verified server-side via get_trip_admin_permissions() RPC
 * (which handles super-admin logic through is_super_admin()).
 *
 * `adminScope` distinguishes full admins (blanket access, incl. private surfaces)
 * from coordinators (outside organizers with logistics-only access).
 */
export const useProTripAdmin = (tripId: string) => {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminScope, setAdminScope] = useState<AdminScope | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdminStatus = useCallback(async () => {
    if (!user?.id || !tripId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      if (isDemoMode) {
        setIsAdmin(true);
        setAdminScope('full');
        setPermissions(DEMO_PERMISSIONS);
        setIsLoading(false);
        return;
      }

      // intentional: get_trip_admin_permissions RPC not yet in generated Supabase types
      const { data, error } = await (supabase as any).rpc('get_trip_admin_permissions', {
        p_trip_id: tripId,
      });

      if (error || !data) {
        setIsAdmin(false);
        setAdminScope(null);
        setPermissions(null);
        return;
      }

      const result = data as unknown as TripAdminPermissionsResult;

      if (!result.is_admin) {
        setIsAdmin(false);
        setAdminScope(null);
        setPermissions(null);
        return;
      }

      setIsAdmin(true);
      setAdminScope(result.admin_scope ?? 'full');
      setPermissions({
        can_manage_roles: result.can_manage_roles,
        can_manage_channels: result.can_manage_channels,
        can_designate_admins: result.can_designate_admins,
        can_manage_shared_calendar: result.can_manage_shared_calendar,
        can_manage_shared_tasks: result.can_manage_shared_tasks,
        can_manage_shared_places: result.can_manage_shared_places,
        can_manage_shared_files: result.can_manage_shared_files,
        can_manage_shared_links: result.can_manage_shared_links,
        can_invite_members: result.can_invite_members,
      });
    } catch (err) {
      setIsAdmin(false);
      setAdminScope(null);
      setPermissions(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, tripId, isDemoMode]);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  const hasPermission = useCallback(
    (permission: keyof AdminPermissions): boolean => {
      if (!isAdmin || !permissions) return false;
      return permissions[permission] === true;
    },
    [isAdmin, permissions],
  );

  return {
    isAdmin,
    adminScope,
    isFullAdmin: isAdmin && adminScope === 'full',
    isCoordinator: isAdmin && adminScope === 'coordinator',
    permissions,
    isLoading,
    hasPermission,
    refreshAdminStatus: checkAdminStatus,
  };
};

