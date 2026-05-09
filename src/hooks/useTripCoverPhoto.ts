import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tripKeys } from '@/lib/queryKeys';
import { isBlobOrDataUrl } from '@/utils/mediaUtils';
import { appendCoverCacheBust, normalizeTripCoverUrl } from '@/utils/tripCoverStorage';
import { useAuth } from './useAuth';
import { useDemoMode } from './useDemoMode';
import { demoModeService } from '@/services/demoModeService';
import { toast } from 'sonner';
import type { Trip } from '@/services/tripService';

export type CoverDisplayMode = 'cover' | 'contain';

export const useTripCoverPhoto = (
  tripId: string,
  initialPhotoUrl?: string,
  initialDisplayMode: CoverDisplayMode = 'cover',
) => {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [coverPhoto, setCoverPhoto] = useState<string | undefined>(initialPhotoUrl);
  const [coverDisplayMode, setCoverDisplayMode] = useState<CoverDisplayMode>(initialDisplayMode);
  const [isUpdating, setIsUpdating] = useState(false);

  const invalidateTripCoverQueries = useCallback(async () => {
    // Refetch detail immediately so the open page reflects new cover bytes,
    // and invalidate every list surface that renders trip cards.
    await Promise.all([
      queryClient.refetchQueries({
        predicate: query => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'trip' && key[1] === tripId;
        },
      }),
      queryClient.invalidateQueries({ queryKey: tripKeys.all }), // ['trips', ...]
      queryClient.invalidateQueries({ queryKey: ['proTrips'] }),
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-request-trip-cards'] }),
      queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) }),
    ]);
  }, [queryClient, tripId]);

  // Keep local state aligned with TanStack Query / parent props (detail key is ['trip', id, userId], not ['trips'])
  useEffect(() => {
    if (isDemoMode) {
      const demoPhoto = demoModeService.getCoverPhoto(tripId);
      setCoverPhoto(demoPhoto ?? initialPhotoUrl);
      setCoverDisplayMode(initialDisplayMode);
      return;
    }
    setCoverPhoto(initialPhotoUrl);
    setCoverDisplayMode(initialDisplayMode);
  }, [isDemoMode, tripId, initialPhotoUrl, initialDisplayMode]);

  /**
   * Helper to update all trip query cache entries with new cover photo URL.
   * Uses predicate matching to handle query keys with userId suffix.
   */
  const updateTripCacheWithCoverPhoto = useCallback(
    (photoUrl: string | null) => {
      // Trip detail queries: ['trip', tripId, ...userIdSuffix]
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

      // Consumer trip lists: ['trips', userId, isDemoMode] — Trip[] with cover_image_url
      queryClient.setQueriesData<Trip[]>({ queryKey: tripKeys.all }, old => {
        if (!Array.isArray(old)) return old;
        return old.map(trip =>
          trip.id === tripId ? { ...trip, cover_image_url: photoUrl } : trip,
        );
      });

      // Pro trips & events lists use a mapped `coverPhoto` field (not cover_image_url).
      // Patch any list whose entries reference this tripId so cards update instantly.
      const patchMappedList = (key: readonly unknown[]) => {
        queryClient.setQueriesData<unknown>({ queryKey: key as any }, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((item: any) =>
            item && item.id === tripId
              ? { ...item, coverPhoto: photoUrl ?? undefined, cover_image_url: photoUrl }
              : item,
          );
        });
      };
      patchMappedList(['proTrips']);
      patchMappedList(['events']);
      patchMappedList(['pending-request-trip-cards']);
    },
    [queryClient, tripId],
  );

  const updateCoverPhoto = async (photoUrl: string): Promise<boolean> => {
    // Reject blob/data URLs from being saved to database (except in demo mode)
    if (isBlobOrDataUrl(photoUrl) && !isDemoMode) {
      console.warn('[useTripCoverPhoto] Rejecting non-persistable URL:', photoUrl);
      toast.error('Upload in progress, please wait...');
      return false;
    }

    // Reject URLs that don't look like images (prevents webpage URLs being saved)
    if (!isDemoMode) {
      // Use URL hostname check to prevent substring bypass (e.g. evil.com?q=unsplash.com)
      const isKnownHost = (() => {
        try {
          const { hostname } = new URL(photoUrl);
          return (
            hostname === 'unsplash.com' ||
            hostname.endsWith('.unsplash.com') ||
            hostname === 'supabase.co' ||
            hostname.endsWith('.supabase.co')
          );
        } catch {
          return false;
        }
      })();
      const hasImageExt = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(photoUrl);
      if (!isKnownHost && !hasImageExt) {
        console.warn('[useTripCoverPhoto] Rejecting non-image URL:', photoUrl);
        toast.error('Please use a direct image URL');
        return false;
      }
    }

    // Demo mode: update session storage
    if (isDemoMode) {
      setCoverPhoto(photoUrl);
      demoModeService.setCoverPhoto(tripId, photoUrl);
      toast.success('Cover photo updated (demo mode)');
      return true;
    }

    // Authenticated mode: update database
    if (!user) {
      toast.error('Please sign in to update cover photos');
      return false;
    }

    setIsUpdating(true);
    try {
      const normalizedPhotoUrl = normalizeTripCoverUrl(photoUrl) ?? photoUrl;
      // Use .select() to verify the update actually happened
      // RLS policy "Trip members can update trip details" handles authorization
      const { data, error } = await supabase
        .from('trips')
        .update({ cover_image_url: normalizedPhotoUrl })
        .eq('id', tripId)
        .select('id, cover_image_url')
        .maybeSingle();

      if (error) throw error;

      // Check if any row was actually updated
      if (!data) {
        console.error('[useTripCoverPhoto] No rows updated - user may not have permission');
        toast.error("You don't have permission to update this trip's cover photo");
        return false;
      }

      // Verify the cover_image_url was actually updated
      if (data.cover_image_url !== normalizedPhotoUrl) {
        console.error('[useTripCoverPhoto] cover_image_url mismatch after update', {
          expected: normalizedPhotoUrl,
          actual: data.cover_image_url,
        });
        toast.error('Cover photo update failed - please try again');
        return false;
      }

      // Update local state immediately with a cache-busted URL so any cached
      // <img> bytes are bypassed across web/PWA/iOS/Android.
      const bustedPhotoUrl = appendCoverCacheBust(normalizedPhotoUrl, Date.now()) ?? normalizedPhotoUrl;
      setCoverPhoto(bustedPhotoUrl);

      // Update query cache using predicate matching for all trip detail queries
      updateTripCacheWithCoverPhoto(bustedPhotoUrl);

      // Invalidate and refetch to ensure consistency
      // Using refetchQueries ensures immediate fresh data rather than background refetch
      // Invalidate every surface that renders this trip's cover (detail page,
      // dashboards, pro/event lists, pending requests, members) and refetch detail.
      await invalidateTripCoverQueries();

      toast.success('Cover photo updated');
      return true;
    } catch (error) {
      console.error('Error updating cover photo:', error);
      toast.error('Failed to update cover photo');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const removeCoverPhoto = async (): Promise<boolean> => {
    // Demo mode: remove from session storage
    if (isDemoMode) {
      setCoverPhoto(undefined);
      demoModeService.removeCoverPhoto(tripId);
      toast.success('Cover photo removed (demo mode)');
      return true;
    }

    // Authenticated mode: remove from database
    if (!user) {
      toast.error('Please sign in to remove cover photos');
      return false;
    }

    setIsUpdating(true);
    try {
      // Use .select() to verify the update actually happened
      // RLS policy handles authorization
      const { data, error } = await supabase
        .from('trips')
        .update({ cover_image_url: null })
        .eq('id', tripId)
        .select('id')
        .maybeSingle();

      if (error) throw error;

      // Check if any row was actually updated
      if (!data) {
        console.error('[useTripCoverPhoto] No rows updated - user may not have permission');
        toast.error("You don't have permission to update this trip's cover photo");
        return false;
      }

      // Delete file from storage if needed
      if (coverPhoto) {
        if (coverPhoto.includes('/storage/v1/object/public/trip-covers/')) {
          const storagePath = coverPhoto
            .split('/storage/v1/object/public/trip-covers/')[1]
            ?.split('?')[0];
          if (storagePath) {
            await supabase.storage.from('trip-covers').remove([storagePath]);
          }
        } else if (coverPhoto.includes('/storage/v1/object/public/trip-media/')) {
          // Legacy path: old uploads went to trip-media/trip-covers/
          const storagePath = coverPhoto
            .split('/storage/v1/object/public/trip-media/')[1]
            ?.split('?')[0];
          if (storagePath) {
            await supabase.storage.from('trip-media').remove([storagePath]);
          }
        }
      }

      // Update local state, then patch caches and invalidate every surface.
      setCoverPhoto(undefined);
      updateTripCacheWithCoverPhoto(null);
      await invalidateTripCoverQueries();

      toast.success('Cover photo removed');
      return true;
    } catch (error) {
      console.error('Error removing cover photo:', error);
      toast.error('Failed to remove cover photo');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const updateCoverDisplayMode = async (mode: CoverDisplayMode): Promise<boolean> => {
    if (isDemoMode) {
      setCoverDisplayMode(mode);
      return true;
    }

    if (!user) {
      toast.error('Please sign in to update cover photo settings');
      return false;
    }

    setIsUpdating(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .update({ cover_display_mode: mode })
        .eq('id', tripId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("You don't have permission to update this trip's cover settings");
        return false;
      }

      setCoverDisplayMode(mode);

      // Update cache with predicate matching
      queryClient.setQueriesData<Trip | null>(
        {
          predicate: query => {
            const key = query.queryKey;
            return Array.isArray(key) && key[0] === 'trip' && key[1] === tripId;
          },
        },
        old => {
          if (old && typeof old === 'object') {
            return { ...old, cover_display_mode: mode };
          }
          return old;
        },
      );

      // Invalidate and refetch
      // Invalidate detail + every list surface so cards reflect the new fit.
      await invalidateTripCoverQueries();

      return true;
    } catch (error) {
      console.error('Error updating cover display mode:', error);
      toast.error('Failed to update cover display mode');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    coverPhoto,
    coverDisplayMode,
    updateCoverPhoto,
    updateCoverDisplayMode,
    removeCoverPhoto,
    isUpdating,
  };
};
