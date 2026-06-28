/**
 * useMutationPermissions — Unified permission guard for shared-object mutations.
 *
 * Primary source: server resolver RPC `get_trip_mutation_permissions`.
 * Fallback: client-side matrix resolution when RPC is unavailable (pre-migration).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useEventPermissions } from '@/hooks/useEventPermissions';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/hooks/useAuth';
import { canRoleAccess } from '@/lib/permissionGuard';
import type { PermissionRole } from '@/types/permissionMatrix.generated';

type TripType = 'consumer' | 'pro' | 'event';

interface MutationPermissions {
  isLoading: boolean;
  tripType: TripType;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  canCreatePoll: boolean;
  canClosePoll: boolean;
  canDeletePoll: boolean;
  canCreateEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
  canSetBasecamp: boolean;
  canSaveLink: boolean;
}

interface ServerMutationPermissions {
  role: PermissionRole;
  trip_type: TripType;
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

const DEMO_PERMISSIONS: MutationPermissions = {
  isLoading: false,
  tripType: 'consumer',
  canCreateTask: true,
  canEditTask: true,
  canDeleteTask: true,
  canCreatePoll: true,
  canClosePoll: true,
  canDeletePoll: true,
  canCreateEvent: true,
  canEditEvent: true,
  canDeleteEvent: true,
  canSetBasecamp: true,
  canSaveLink: true,
};

const LOADING_PERMISSIONS: MutationPermissions = {
  isLoading: true,
  tripType: 'consumer',
  canCreateTask: false,
  canEditTask: false,
  canDeleteTask: false,
  canCreatePoll: false,
  canClosePoll: false,
  canDeletePoll: false,
  canCreateEvent: false,
  canEditEvent: false,
  canDeleteEvent: false,
  canSetBasecamp: false,
  canSaveLink: false,
};

function mapServerPermissions(data: ServerMutationPermissions): MutationPermissions {
  return {
    isLoading: false,
    tripType: data.trip_type,
    canCreateTask: data.can_create_task,
    canEditTask: data.can_edit_task,
    canDeleteTask: data.can_delete_task,
    canCreatePoll: data.can_create_poll,
    canClosePoll: data.can_close_poll,
    canDeletePoll: data.can_delete_poll,
    canCreateEvent: data.can_create_event,
    canEditEvent: data.can_edit_event,
    canDeleteEvent: data.can_delete_event,
    canSetBasecamp: data.can_set_basecamp,
    canSaveLink: data.can_save_link,
  };
}

export function useMutationPermissions(tripId: string): MutationPermissions {
  const { isDemoMode } = useDemoMode();
  const { authState } = useAuth();
  const rolePerms = useRolePermissions(tripId);
  const eventPerms = useEventPermissions(tripId);

  const { data: tripType = 'consumer', isLoading: typeLoading } = useQuery({
    queryKey: ['tripType', tripId],
    queryFn: async (): Promise<TripType> => {
      if (isDemoMode) return 'consumer';
      const { data, error } = await supabase
        .from('trips')
        .select('trip_type')
        .eq('id', tripId)
        .maybeSingle();
      if (error || !data) return 'consumer';
      const raw = data.trip_type as string | null;
      if (raw === 'pro' || raw === 'event') return raw;
      return 'consumer';
    },
    enabled: !!tripId && !isDemoMode,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: serverPerms, isLoading: serverLoading } = useQuery({
    queryKey: ['tripMutationPermissions', tripId],
    queryFn: async (): Promise<ServerMutationPermissions | null> => {
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, string>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc('get_trip_mutation_permissions', {
        p_trip_id: tripId,
      });
      if (error) return null;
      return data as ServerMutationPermissions;
    },
    enabled: !!tripId && !isDemoMode && authState === 'authenticated',
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  if (isDemoMode) {
    return DEMO_PERMISSIONS;
  }

  if (serverPerms) {
    return mapServerPermissions(serverPerms);
  }

  const isLoading = typeLoading || serverLoading || rolePerms.isLoading || eventPerms.isLoading;

  const resolvedRole: PermissionRole = (() => {
    if (tripType === 'consumer') {
      return rolePerms.isTripMember ? 'consumer_member' : 'consumer_guest';
    }
    if (tripType === 'event') {
      return eventPerms.isOrganizer ? 'event_organizer' : 'event_attendee';
    }
    if (rolePerms.isAdmin) return 'pro_admin';
    if (rolePerms.canEdit) return 'pro_editor';
    return 'pro_viewer';
  })();

  if (isLoading) {
    return LOADING_PERMISSIONS;
  }

  return {
    isLoading: false,
    tripType,
    canCreateTask: canRoleAccess(resolvedRole, 'tasks', 'write'),
    canEditTask: canRoleAccess(resolvedRole, 'tasks', 'write'),
    canDeleteTask: canRoleAccess(resolvedRole, 'tasks', 'delete'),
    canCreatePoll: canRoleAccess(resolvedRole, 'polls', 'write'),
    canClosePoll: canRoleAccess(resolvedRole, 'polls', 'admin'),
    canDeletePoll: canRoleAccess(resolvedRole, 'polls', 'delete'),
    canCreateEvent: canRoleAccess(resolvedRole, 'calendar', 'write'),
    canEditEvent: canRoleAccess(resolvedRole, 'calendar', 'write'),
    canDeleteEvent: canRoleAccess(resolvedRole, 'calendar', 'delete'),
    canSetBasecamp: canRoleAccess(resolvedRole, 'basecamp', 'admin'),
    canSaveLink: canRoleAccess(resolvedRole, 'links', 'write'),
  };
}
