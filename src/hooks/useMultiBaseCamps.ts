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

const nextOrderIndex = (camps: BaseCampRecord[] | undefined): number => {
  if (!camps || camps.length === 0) return 0;
  return Math.max(...camps.map(c => c.order_index)) + 1;
};

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
      const existing = qc.getQueryData<BaseCampRecord[]>(keys.trip(tripId)) ?? [];
      const order_index = payload.order_index ?? nextOrderIndex(existing);
      const { data, error } = await supabase
        .from('trip_base_camps')
        .insert({ ...payload, trip_id: tripId, created_by: user?.id, order_index })
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onMutate: async payload => {
      await qc.cancelQueries({ queryKey: keys.trip(tripId) });
      const previous = qc.getQueryData<BaseCampRecord[]>(keys.trip(tripId));
      const optimistic: BaseCampRecord = {
        id: `optimistic-${Date.now()}`,
        trip_id: tripId,
        created_by: user?.id,
        address: payload.address,
        label: payload.label ?? null,
        place_name: payload.place_name ?? null,
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        order_index: payload.order_index ?? nextOrderIndex(previous),
        notes: payload.notes ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
      };
      qc.setQueryData<BaseCampRecord[]>(keys.trip(tripId), [...(previous ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.trip(tripId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
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
    onMutate: async ({ id, ...payload }) => {
      await qc.cancelQueries({ queryKey: keys.trip(tripId) });
      const previous = qc.getQueryData<BaseCampRecord[]>(keys.trip(tripId));
      if (previous) {
        qc.setQueryData<BaseCampRecord[]>(
          keys.trip(tripId),
          previous.map(c => (c.id === id ? { ...c, ...payload } : c)),
        );
      }
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.trip(tripId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
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
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: keys.trip(tripId) });
      const previous = qc.getQueryData<BaseCampRecord[]>(keys.trip(tripId));
      if (previous) {
        qc.setQueryData<BaseCampRecord[]>(
          keys.trip(tripId),
          previous.filter(c => c.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.trip(tripId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.trip(tripId) }),
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
      const personalKey = keys.personal(tripId, user?.id ?? 'anon');
      const existing = qc.getQueryData<BaseCampRecord[]>(personalKey) ?? [];
      const order_index = payload.order_index ?? nextOrderIndex(existing);
      const { data, error } = await supabase
        .from('trip_personal_base_camps')
        .insert({ ...payload, trip_id: tripId, user_id: user?.id, order_index })
        .select('*')
        .single();
      if (error) throw error;
      return data as BaseCampRecord;
    },
    onMutate: async payload => {
      if (!user?.id) return { previous: undefined };
      const personalKey = keys.personal(tripId, user.id);
      await qc.cancelQueries({ queryKey: personalKey });
      const previous = qc.getQueryData<BaseCampRecord[]>(personalKey);
      const optimistic: BaseCampRecord = {
        id: `optimistic-${Date.now()}`,
        trip_id: tripId,
        user_id: user.id,
        address: payload.address,
        label: payload.label ?? null,
        place_name: payload.place_name ?? null,
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        order_index: payload.order_index ?? nextOrderIndex(previous),
        notes: payload.notes ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
      };
      qc.setQueryData<BaseCampRecord[]>(personalKey, [...(previous ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (user?.id && ctx?.previous) {
        qc.setQueryData(keys.personal(tripId, user.id), ctx.previous);
      }
    },
    onSettled: () => {
      if (user?.id) qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) });
    },
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
    onMutate: async ({ id, ...payload }) => {
      if (!user?.id) return { previous: undefined };
      const personalKey = keys.personal(tripId, user.id);
      await qc.cancelQueries({ queryKey: personalKey });
      const previous = qc.getQueryData<BaseCampRecord[]>(personalKey);
      if (previous) {
        qc.setQueryData<BaseCampRecord[]>(
          personalKey,
          previous.map(c => (c.id === id ? { ...c, ...payload } : c)),
        );
      }
      return { previous };
    },
    onError: (_err, _payload, ctx) => {
      if (user?.id && ctx?.previous) {
        qc.setQueryData(keys.personal(tripId, user.id), ctx.previous);
      }
    },
    onSettled: () => {
      if (user?.id) qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) });
    },
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
    onMutate: async id => {
      if (!user?.id) return { previous: undefined };
      const personalKey = keys.personal(tripId, user.id);
      await qc.cancelQueries({ queryKey: personalKey });
      const previous = qc.getQueryData<BaseCampRecord[]>(personalKey);
      if (previous) {
        qc.setQueryData<BaseCampRecord[]>(
          personalKey,
          previous.filter(c => c.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (user?.id && ctx?.previous) {
        qc.setQueryData(keys.personal(tripId, user.id), ctx.previous);
      }
    },
    onSettled: () => {
      if (user?.id) qc.invalidateQueries({ queryKey: keys.personal(tripId, user.id) });
    },
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
