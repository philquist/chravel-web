import type { QueryClient } from '@tanstack/react-query';
import { tripKeys } from './queryKeys';
import type { Trip } from '@/services/tripService';

/**
 * Single source of truth for the query keys that render a trip's cover photo.
 * Any code path that updates `cover_image_url` MUST call this so consumer,
 * pro, event, and pending-request surfaces refresh together.
 */
export const invalidateTripCoverQueries = async (
  queryClient: QueryClient,
  tripId: string,
): Promise<void> => {
  await Promise.all([
    queryClient.refetchQueries({
      predicate: query => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'trip' && key[1] === tripId;
      },
    }),
    queryClient.invalidateQueries({ queryKey: tripKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['proTrips'] }),
    queryClient.invalidateQueries({ queryKey: ['events'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-request-trip-cards'] }),
    queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) }),
  ]);
};

/**
 * Optimistically patch every cached trip surface with a new cover photo URL,
 * matching the field name used by each list (cover_image_url for the raw Trip
 * shape, coverPhoto for converter-mapped pro/event/pending lists).
 *
 * Pass `null` to clear the cover.
 */
export const updateTripCoverCache = (
  queryClient: QueryClient,
  tripId: string,
  photoUrl: string | null,
): void => {
  queryClient.setQueriesData<Trip | null>(
    {
      predicate: query => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'trip' && key[1] === tripId;
      },
    },
    old => {
      if (old && typeof old === 'object') {
        return { ...old, cover_image_url: photoUrl };
      }
      return old;
    },
  );

  queryClient.setQueriesData<Trip[]>({ queryKey: tripKeys.all }, old => {
    if (!Array.isArray(old)) return old;
    return old.map(trip => (trip.id === tripId ? { ...trip, cover_image_url: photoUrl } : trip));
  });

  const patchMappedList = (key: readonly unknown[]) => {
    queryClient.setQueriesData<unknown>({ queryKey: key as readonly unknown[] }, (old: unknown) => {
      if (!Array.isArray(old)) return old;
      return old.map((item: { id?: string }) =>
        item && item.id === tripId
          ? { ...item, coverPhoto: photoUrl ?? undefined, cover_image_url: photoUrl }
          : item,
      );
    });
  };
  patchMappedList(['proTrips']);
  patchMappedList(['events']);
  patchMappedList(['pending-request-trip-cards']);
};
