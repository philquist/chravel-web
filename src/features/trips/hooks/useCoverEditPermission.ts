import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';

/**
 * Single-source-of-truth hook for "can this user change this trip's cover photo?".
 *
 * Mirrors public.can_edit_trip_cover(_trip_id, _user_id) in Postgres:
 *   - consumer: any active trip member
 *   - pro/event: creator or trip_admins entry
 *   - super_admin: always
 *
 * Used by every cover-edit surface (upload modal, generate button, edit modal).
 * Demo mode always returns true so previews aren't gated.
 */
export function useCoverEditPermission(tripId: string | undefined | null) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();

  const enabled = !!tripId && !!user && !isDemoMode;

  const query = useQuery({
    queryKey: ['can-edit-trip-cover', tripId, user?.id],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_edit_trip_cover', {
        _trip_id: tripId!,
        _user_id: user!.id,
      });
      if (error) throw error;
      return !!data;
    },
  });

  if (isDemoMode) return { canEdit: true, isLoading: false } as const;
  if (!user || !tripId) return { canEdit: false, isLoading: false } as const;
  return { canEdit: query.data ?? false, isLoading: query.isLoading } as const;
}
