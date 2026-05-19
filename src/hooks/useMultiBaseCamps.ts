import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveCurrentBaseCamp } from '@/utils/baseCamps';

export interface BaseCampRecord {
  id: string;
  trip_id: string;
  created_by?: string;
  user_id?: string;
  address: string;
  place_name?: string | null;
  label?: string | null;
  google_place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  order_index: number;
  notes?: string | null;
}

const keys = {
  trip: (tripId: string) => ['tripBaseCamps', tripId] as const,
  personal: (tripId: string, userId: string) => ['personalBaseCamps', tripId, userId] as const,
};

const orderBaseCamps = (camps: BaseCampRecord[]) =>
  [...camps].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      `${a.start_date ?? ''}`.localeCompare(`${b.start_date ?? ''}`),
  );

export const useTripBaseCamps = (tripId: string) =>
  useQuery({
    queryKey: keys.trip(tripId),
    enabled: !!tripId,
    queryFn: async (): Promise<BaseCampRecord[]> => {
      const { data, error } = await supabase
        .from('trip_base_camps')
        .select('*')
        .eq('trip_id', tripId)
        .order('order_index', { ascending: true })
        .order('start_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as BaseCampRecord[];
    },
  });

export const usePersonalBaseCamps = (tripId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.personal(tripId, user?.id ?? 'anon'),
    enabled: !!tripId && !!user,
    queryFn: async (): Promise<BaseCampRecord[]> => {
      const { data, error } = await supabase
        .from('trip_personal_base_camps')
        .select('*')
        .eq('trip_id', tripId)
        .eq('user_id', user!.id)
        .order('order_index', { ascending: true })
        .order('start_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as BaseCampRecord[];
    },
  });
};

export const useCreateTripBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<BaseCampRecord> & { address: string }) => {
      const { data, error } = await supabase
        .from('trip_base_camps')
        .insert({ ...payload, trip_id: tripId, created_by: user?.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
  });
};

export const useUpdateTripBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<BaseCampRecord> & { id: string }) => {
      const { data, error } = await supabase
        .from('trip_base_camps')
        .update(payload)
        .eq('id', id)
        .eq('trip_id', tripId)
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
  });
};

export const useDeleteTripBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trip_base_camps')
        .delete()
        .eq('id', id)
        .eq('trip_id', tripId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
  });
};

export const useReorderTripBaseCamps = (tripId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          supabase
            .from('trip_base_camps')
            .update({ order_index: index })
            .eq('trip_id', tripId)
            .eq('id', id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
  });
};

export const useCreatePersonalBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<BaseCampRecord> & { address: string }) => {
      const { data, error } = await supabase
        .from('trip_personal_base_camps')
        .insert({ ...payload, trip_id: tripId, user_id: user?.id, created_by: user?.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onSuccess: () => user?.id && qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) }),
  });
};

export const useUpdatePersonalBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<BaseCampRecord> & { id: string }) => {
      const { data, error } = await supabase
        .from('trip_personal_base_camps')
        .update(payload)
        .eq('id', id)
        .eq('trip_id', tripId)
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onSuccess: () => user?.id && qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) }),
  });
};

export const useDeletePersonalBaseCamp = (tripId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trip_personal_base_camps')
        .delete()
        .eq('id', id)
        .eq('trip_id', tripId);
      if (error) throw error;
    },
    onSuccess: () => user?.id && qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) }),
  });
};

export const useCurrentTripBaseCamp = (tripId: string, timezone?: string) => {
  const trip = useTripBaseCamps(tripId);
  const current = resolveCurrentBaseCamp(orderBaseCamps(trip.data ?? []), new Date(), timezone);
  return { ...trip, currentBaseCamp: current };
};

export const useCurrentPersonalBaseCamp = (tripId: string, timezone?: string) => {
  const personal = usePersonalBaseCamps(tripId);
  const current = resolveCurrentBaseCamp(orderBaseCamps(personal.data ?? []), new Date(), timezone);
  return { ...personal, currentBaseCamp: current };
};
