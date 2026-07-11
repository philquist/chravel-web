import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDemoMode } from './useDemoMode';
import { useAuth } from './useAuth';
import { tripKeys, QUERY_CACHE_CONFIG } from '@/lib/queryKeys';

export type AdminScope = 'full' | 'coordinator';

export interface TripAdmin {
  id: string;
  trip_id: string;
  user_id: string;
  granted_by?: string;
  granted_at: string;
  admin_scope: AdminScope;
  permissions: {
    can_manage_roles: boolean;
    can_manage_channels: boolean;
    can_designate_admins: boolean;
    can_manage_shared_calendar: boolean;
    can_manage_shared_tasks: boolean;
    can_manage_shared_places: boolean;
    can_manage_shared_files: boolean;
    can_manage_shared_links: boolean;
    can_invite_members: boolean;
  };
  profile?: {
    display_name: string;
    avatar_url?: string;
  };
}

interface UseTripAdminsProps {
  tripId: string;
  enabled?: boolean;
}

async function fetchTripAdmins(
  tripId: string,
  isDemoMode: boolean,
  userId?: string,
): Promise<TripAdmin[]> {
  if (isDemoMode && userId) {
    return [
      {
        id: `mock-admin-${tripId}`,
        trip_id: tripId,
        user_id: userId,
        granted_by: userId,
        granted_at: new Date().toISOString(),
        admin_scope: 'full',
        permissions: {
          can_manage_roles: true,
          can_manage_channels: true,
          can_designate_admins: true,
          can_manage_shared_calendar: true,
          can_manage_shared_tasks: true,
          can_manage_shared_places: true,
          can_manage_shared_files: true,
          can_manage_shared_links: true,
          can_invite_members: true,
        },
        profile: {
          display_name: 'Demo User',
          avatar_url: undefined,
        },
      },
    ];
  }

  const { data, error } = await supabase
    .from('trip_admins')
    .select('*')
    .eq('trip_id', tripId)
    .order('granted_at', { ascending: true });

  if (error) throw error;

  const adminsWithProfiles: TripAdmin[] = await Promise.all(
    (data || []).map(async admin => {
      const { data: profile } = await supabase
        .from('profiles_public')
        .select('display_name, resolved_display_name, avatar_url')
        .eq('user_id', admin.user_id)
        .single();

      const permissions = admin.permissions as Record<string, unknown> | null;
      const scope: AdminScope =
        (permissions?.admin_scope as AdminScope | undefined) === 'coordinator'
          ? 'coordinator'
          : 'full';
      const boolCap = (key: string, fallback: boolean): boolean => {
        const v = permissions?.[key];
        return typeof v === 'boolean' ? v : fallback;
      };
      // Full admins default to true across capabilities (backward compat with legacy rows).
      const fullDefault = scope === 'full';

      return {
        id: admin.id,
        trip_id: admin.trip_id,
        user_id: admin.user_id,
        granted_by: admin.granted_by ?? undefined,
        granted_at: admin.granted_at ?? new Date().toISOString(),
        admin_scope: scope,
        permissions: {
          can_manage_roles: scope === 'full' && boolCap('can_manage_roles', fullDefault),
          can_manage_channels: scope === 'full' && boolCap('can_manage_channels', fullDefault),
          can_designate_admins: scope === 'full' && boolCap('can_designate_admins', false),
          can_manage_shared_calendar: boolCap('can_manage_shared_calendar', true),
          can_manage_shared_tasks: boolCap('can_manage_shared_tasks', true),
          can_manage_shared_places: boolCap('can_manage_shared_places', true),
          can_manage_shared_files: boolCap('can_manage_shared_files', true),
          can_manage_shared_links: boolCap('can_manage_shared_links', true),
          can_invite_members:
            scope === 'full'
              ? boolCap('can_invite_members', true)
              : boolCap('can_invite_members', false),
        },
        profile: profile
          ? {
              display_name: profile.resolved_display_name || profile.display_name || 'User',
              avatar_url: profile.avatar_url ?? undefined,
            }
          : undefined,
      };
    }),
  );

  return adminsWithProfiles;
}

export const useTripAdmins = ({ tripId, enabled = true }: UseTripAdminsProps) => {
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: admins = [],
    isLoading,
    refetch,
    isError,
    error,
  } = useQuery({
    queryKey: tripKeys.tripAdmins(tripId),
    queryFn: () => fetchTripAdmins(tripId, isDemoMode, user?.id),
    enabled: enabled && !!tripId,
    staleTime: QUERY_CACHE_CONFIG.tripAdmins.staleTime,
    gcTime: QUERY_CACHE_CONFIG.tripAdmins.gcTime,
    refetchOnWindowFocus: QUERY_CACHE_CONFIG.tripAdmins.refetchOnWindowFocus,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error('Failed to load admins');
    }
  }, [isError, error]);

  // Subscribe to realtime updates (skip in demo mode)
  useEffect(() => {
    if (!enabled || !tripId || isDemoMode) return;

    const channel = supabase
      .channel(`trip_admins:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_admins',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: tripKeys.tripAdmins(tripId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, enabled, isDemoMode, queryClient]);

  const [isProcessing, setIsProcessing] = useState(false);

  const promoteToAdmin = useCallback(
    async (targetUserId: string, options: { scope?: 'full' | 'coordinator' } = {}) => {
      const scope = options.scope ?? 'full';
      const successLabel =
        scope === 'coordinator' ? '✅ User added as coordinator' : '✅ User promoted to admin';

      if (isDemoMode) {
        toast.success(successLabel);
        return { success: true, message: 'User promoted' };
      }

      setIsProcessing(true);
      try {
        const { data, error } = await supabase.rpc(
          'promote_to_admin' as const,
          {
            _trip_id: tripId,
            _target_user_id: targetUserId,
            // intentional: extended 3rd arg not yet in generated Supabase types
            _scope: scope,
          } as unknown as { _trip_id: string; _target_user_id: string },
        );

        if (error) throw error;

        const result = data as { success: boolean; message: string };
        if (!result.success) throw new Error(result.message);

        toast.success(successLabel);
        await queryClient.invalidateQueries({ queryKey: tripKeys.tripAdmins(tripId) });
        return result;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, isDemoMode, queryClient],
  );

  const setAdminScope = useCallback(
    async (targetUserId: string, scope: 'full' | 'coordinator') => {
      if (isDemoMode) {
        toast.success(`Scope updated to ${scope}`);
        return { success: true };
      }

      setIsProcessing(true);
      try {
        // intentional: set_admin_scope RPC not yet in generated Supabase types
        const { data, error } = await (supabase as any).rpc('set_admin_scope', {
          _trip_id: tripId,
          _target_user_id: targetUserId,
          _scope: scope,
        });

        if (error) throw error;

        const result = data as { success: boolean; message?: string };
        if (!result.success) throw new Error(result.message ?? 'Failed to update scope');

        toast.success(`Scope updated to ${scope}`);
        await queryClient.invalidateQueries({ queryKey: tripKeys.tripAdmins(tripId) });
        return result;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, isDemoMode, queryClient],
  );

  const demoteFromAdmin = useCallback(
    async (targetUserId: string) => {
      if (isDemoMode) {
        toast.success('User demoted from admin');
        return { success: true, message: 'User demoted' };
      }

      setIsProcessing(true);
      try {
        const { data, error } = await supabase.rpc('demote_from_admin' as const, {
          _trip_id: tripId,
          _target_user_id: targetUserId,
        });

        if (error) throw error;

        const result = data as { success: boolean; message: string };
        if (!result.success) throw new Error(result.message);

        toast.success('User demoted from admin');
        await queryClient.invalidateQueries({ queryKey: tripKeys.tripAdmins(tripId) });
        return result;
      } finally {
        setIsProcessing(false);
      }
    },
    [tripId, isDemoMode, queryClient],
  );

  return {
    admins,
    isLoading,
    isProcessing,
    promoteToAdmin,
    demoteFromAdmin,
    setAdminScope,
    refetch,
  };
};
