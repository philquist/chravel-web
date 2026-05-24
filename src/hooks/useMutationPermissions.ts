/**
 * useMutationPermissions — Unified permission guard for shared-object mutations.
 *
 * Resolves trip type (consumer / pro / event) and returns flat boolean flags
 * indicating whether the current user can perform each mutation action.
 *
 * Consumer trips: all members can do everything (default behavior, unchanged).
 * Pro trips: delegates to `useRolePermissions` (feature_permissions JSONB).
 * Event trips: delegates to `useEventPermissions` (organizer vs attendee).
 *
 * These are CLIENT-SIDE UX guards only. RLS is the authoritative enforcement layer.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useEventPermissions } from '@/hooks/useEventPermissions';
import { useDemoMode } from '@/hooks/useDemoMode';
import { canRoleAccess } from '@/lib/permissionGuard';
import type { PermissionRole } from '@/types/permissionMatrix.generated';

type TripType = 'consumer' | 'pro' | 'event';

interface MutationPermissions {
  /** Whether permission data is still loading */
  isLoading: boolean;
  /** Resolved trip type */
  tripType: TripType;
  /** Task mutations */
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  /** Poll mutations */
  canCreatePoll: boolean;
  canClosePoll: boolean;
  canDeletePoll: boolean;
  /** Calendar mutations */
  canCreateEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
  /** Basecamp mutations */
  canSetBasecamp: boolean;
  /** Explore link mutations */
  canSaveLink: boolean;
}

export function useMutationPermissions(tripId: string): MutationPermissions {
  const { isDemoMode } = useDemoMode();
  const rolePerms = useRolePermissions(tripId);
  const eventPerms = useEventPermissions(tripId);

  // Fetch trip_type (lightweight, cached)
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
    enabled: !!tripId,
    staleTime: 5 * 60 * 1000, // trip type doesn't change often
    gcTime: 10 * 60 * 1000,
  });

  const isLoading = typeLoading || rolePerms.isLoading || eventPerms.isLoading;

  const resolvedRole: PermissionRole = (() => {
    if (isDemoMode) return 'demo';
    if (tripType === 'consumer')
      return rolePerms.isTripMember ? 'consumer_member' : 'consumer_guest';
    if (tripType === 'event') return eventPerms.isOrganizer ? 'event_organizer' : 'event_attendee';
    if (rolePerms.isAdmin) return 'pro_admin';
    if (rolePerms.canEdit) return 'pro_editor';
    return 'pro_viewer';
  })();

  if (isLoading) {
    return {
      isLoading: true,
      tripType,
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
