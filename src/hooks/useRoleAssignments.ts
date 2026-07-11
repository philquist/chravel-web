import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDemoMode } from './useDemoMode';
import { useAuth } from './useAuth';
import {
  reportRoleGrantContractInconsistencies,
  validateRoleGrantStreamContract,
} from '@/services/stream/roleGrantMembershipContract';

export interface RoleAssignment {
  id: string;
  trip_id: string;
  user_id: string;
  role_id: string;
  is_primary: boolean;
  assigned_at: string;
  assigned_by?: string;
  user_profile?: {
    display_name: string;
    avatar_url?: string;
  };
  role?: {
    id: string;
    roleName: string;
    permissionLevel: string;
  };
}

interface UseRoleAssignmentsProps {
  tripId: string;
  enabled?: boolean;
}

export const useRoleAssignments = ({ tripId, enabled = true }: UseRoleAssignmentsProps) => {
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const validateContract = useCallback(
    async (operation: 'assign' | 'revoke', targetUserId: string, targetRoleId: string) => {
      if (isDemoMode) return;

      try {
        const validation = await validateRoleGrantStreamContract({
          tripId,
          userId: targetUserId,
          roleId: targetRoleId,
          operation,
        });
        reportRoleGrantContractInconsistencies(validation);
      } catch (error) {
        console.error('[useRoleAssignments] Contract validation failed', {
          operation,
          tripId,
          userId: targetUserId,
          roleId: targetRoleId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [isDemoMode, tripId],
  );

  // Best-effort Stream remediation after a role change. The role RPCs update
  // user_trip_roles + channel_members (via trigger), but nothing projects that
  // into Stream immediately — the contract validator only *detects* drift. Ask
  // the trip-scoped reconciler to add newly-eligible members and prune revoked
  // ones now, instead of waiting up to 15 min for the cron or the next channel
  // open. Fire-and-forget: this reconciles every channel in the trip (several
  // Stream round-trips), so callers must NOT await it in the mutation's critical
  // path — the success toast and list refresh should not wait on it. Failure is
  // non-fatal: the cron / open-time self-heal still converge. Errors are
  // swallowed internally so the detached promise never rejects unhandled.
  const syncStreamMembership = useCallback(async () => {
    if (isDemoMode || !tripId) return;
    try {
      const response = await supabase.functions.invoke('stream-reconcile-membership', {
        body: { tripId },
      });
      if (response.error && import.meta.env.DEV) {
        console.error('[useRoleAssignments] Stream membership sync failed', response.error);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[useRoleAssignments] Stream membership sync threw', error);
      }
    }
  }, [isDemoMode, tripId]);

  const fetchAssignments = useCallback(async () => {
    if (!enabled || !tripId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // 🆕 DEMO MODE: Load from localStorage
      if (isDemoMode) {
        const stored = localStorage.getItem('demo_pro_trip_assignments');
        const allAssignments = stored ? JSON.parse(stored) : {};
        setAssignments(allAssignments[tripId] || []);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_trip_roles')
        .select('*')
        .eq('trip_id', tripId)
        .order('assigned_at', { ascending: true });

      if (error) throw error;

      const rawAssignments = data || [];
      if (rawAssignments.length === 0) {
        setAssignments([]);
        return;
      }

      // Batch fetch: collect unique user_ids and role_ids
      const userIds = [...new Set(rawAssignments.map(a => a.user_id).filter(Boolean))];
      const roleIds = [...new Set(rawAssignments.map(a => a.role_id).filter(Boolean))];

      const [profilesResult, rolesResult] = await Promise.all([
        userIds.length > 0
          ? supabase
              .from('profiles_public')
              .select('user_id, display_name, resolved_display_name, avatar_url')
              .in('user_id', userIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        roleIds.length > 0
          ? supabase.from('trip_roles').select('id, role_name, permission_level').in('id', roleIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);

      const profilesMap = new Map(
        (profilesResult.data || []).map(
          (p: {
            user_id: string;
            display_name?: string;
            resolved_display_name?: string;
            avatar_url?: string;
          }) => [
            p.user_id,
            {
              display_name: p.resolved_display_name || p.display_name,
              avatar_url: p.avatar_url,
            },
          ],
        ),
      );
      const rolesMap = new Map(
        (rolesResult.data || []).map(
          (r: { id: string; role_name: string; permission_level: string }) => [
            r.id,
            { id: r.id, roleName: r.role_name, permissionLevel: r.permission_level },
          ],
        ),
      );

      const assignmentsWithDetails: RoleAssignment[] = rawAssignments.map(assignment => ({
        ...assignment,
        user_profile: profilesMap.get(assignment.user_id),
        role: rolesMap.get(assignment.role_id),
      }));

      setAssignments(assignmentsWithDetails);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching role assignments:', error);
      toast.error('Failed to load role assignments');
    } finally {
      setIsLoading(false);
    }
  }, [tripId, enabled, isDemoMode]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Subscribe to realtime updates (skip in demo mode)
  useEffect(() => {
    if (!enabled || !tripId || isDemoMode) return;

    const channel = supabase
      .channel(`user_trip_roles:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_trip_roles',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          fetchAssignments();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, enabled, isDemoMode, fetchAssignments]);

  const assignRole = useCallback(
    async (userId: string, roleId: string) => {
      setIsProcessing(true);

      try {
        // 🆕 DEMO MODE: Add to localStorage
        if (isDemoMode) {
          const stored = localStorage.getItem('demo_pro_trip_assignments');
          const allAssignments = stored ? JSON.parse(stored) : {};
          const tripAssignments = allAssignments[tripId] || [];

          const newAssignment: RoleAssignment = {
            id: `mock-assignment-${Date.now()}`,
            trip_id: tripId,
            user_id: userId,
            role_id: roleId,
            is_primary: true,
            assigned_at: new Date().toISOString(),
            assigned_by: user?.id,
          };

          allAssignments[tripId] = [...tripAssignments, newAssignment];
          localStorage.setItem('demo_pro_trip_assignments', JSON.stringify(allAssignments));

          toast.success('✅ Role assigned successfully');
          await fetchAssignments();
          return { success: true, message: 'Role assigned' };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
        const { data, error } = await supabase.rpc('assign_trip_role' as any, {
          _trip_id: tripId,
          _user_id: userId,
          _role_id: roleId,
          _set_as_primary: false,
        });

        if (error) throw error;

        const result = data as { success: boolean; message: string };
        if (!result.success) {
          throw new Error(result.message);
        }

        await validateContract('assign', userId, roleId);
        void syncStreamMembership();
        toast.success('✅ Role assigned successfully');
        await fetchAssignments();

        return result;
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error assigning role:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to assign role');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, fetchAssignments, isDemoMode, user?.id, validateContract, syncStreamMembership],
  );

  const removeRole = useCallback(
    async (userId: string, roleId: string) => {
      setIsProcessing(true);

      try {
        // 🆕 DEMO MODE: Remove from localStorage
        if (isDemoMode) {
          const stored = localStorage.getItem('demo_pro_trip_assignments');
          const allAssignments = stored ? JSON.parse(stored) : {};
          const tripAssignments = allAssignments[tripId] || [];

          allAssignments[tripId] = tripAssignments.filter(
            (a: RoleAssignment) => !(a.user_id === userId && a.role_id === roleId),
          );
          localStorage.setItem('demo_pro_trip_assignments', JSON.stringify(allAssignments));

          toast.success('Role removed successfully');
          await fetchAssignments();
          return { success: true, message: 'Role removed' };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
        const { data, error } = await supabase.rpc('remove_user_from_role' as any, {
          _trip_id: tripId,
          _user_id: userId,
          _role_id: roleId,
        });

        if (error) throw error;

        const result = data as { success: boolean; message: string };
        if (!result.success) {
          throw new Error(result.message);
        }

        await validateContract('revoke', userId, roleId);
        void syncStreamMembership();
        toast.success('Role removed successfully');
        await fetchAssignments();

        return result;
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error removing role:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to remove role');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, fetchAssignments, isDemoMode, validateContract, syncStreamMembership],
  );

  /**
   * Self-service function for a user to leave a role/channel.
   * Unlike removeRole (which requires admin permissions), this only allows
   * the authenticated user to remove their own role assignment.
   */
  const leaveRole = useCallback(
    async (roleId: string) => {
      setIsProcessing(true);

      try {
        // 🆕 DEMO MODE: Remove current user from localStorage
        if (isDemoMode) {
          const stored = localStorage.getItem('demo_pro_trip_assignments');
          const allAssignments = stored ? JSON.parse(stored) : {};
          const tripAssignments = allAssignments[tripId] || [];

          // Remove the current user's assignment to this role
          allAssignments[tripId] = tripAssignments.filter(
            (a: RoleAssignment) => !(a.user_id === user?.id && a.role_id === roleId),
          );
          localStorage.setItem('demo_pro_trip_assignments', JSON.stringify(allAssignments));

          toast.success('Left the channel successfully');
          await fetchAssignments();
          return { success: true, message: 'Left the channel' };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
        const { data, error } = await supabase.rpc('leave_trip_role' as any, {
          _trip_id: tripId,
          _role_id: roleId,
        });

        if (error) throw error;

        const result = data as { success: boolean; message: string };
        if (!result.success) {
          throw new Error(result.message);
        }

        void syncStreamMembership();
        toast.success('Left the channel successfully');
        await fetchAssignments();

        return result;
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error leaving role:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to leave channel');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, fetchAssignments, isDemoMode, user?.id, syncStreamMembership],
  );

  return {
    assignments,
    isLoading,
    isProcessing,
    assignRole,
    removeRole,
    leaveRole,
    refetch: fetchAssignments,
  };
};
