import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TRIP_COVER_BUCKET,
  normalizeTripCoverUrl,
  uploadTripCoverBlob,
} from '@/utils/tripCoverStorage';
import { invalidateTripCoverQueries, updateTripCoverCache } from '@/lib/tripCoverInvalidation';

export type CoverUploadResult = { ok: true; publicUrl: string } | { ok: false; error: string };

interface UploadOptions {
  /**
   * Caller-provided persistence step. When supplied, the hook delegates the
   * cover_image_url write to this callback (typically `useTripCoverPhoto.updateCoverPhoto`)
   * so the caller's local state and validation stay in charge.
   *
   * When omitted, the hook writes `cover_image_url` directly via Supabase and
   * invalidates the cover query surfaces. Use this mode when there is no
   * existing `useTripCoverPhoto` instance — e.g. trip creation, where the
   * tripId is only known after `tripService.createTrip` resolves.
   */
  persist?: (publicUrl: string) => Promise<boolean>;
}

/**
 * Single owner of the trip-cover upload pipeline.
 *
 * Why this exists:
 * - CreateTripModal, EditTripModal (via TripCoverPhotoUpload), and TripHeader
 *   all duplicated `uploadTripCoverBlob` + cleanup-on-failure + cache-invalidation,
 *   each with subtly different invalidation footprints. Past fixes touched one
 *   path and silently regressed the others. This hook is now the only place
 *   that talks to storage during a cover upload.
 */
export const useCoverPhotoUpload = () => {
  const queryClient = useQueryClient();

  const upload = useCallback(
    async (tripId: string, blob: Blob, options: UploadOptions = {}): Promise<CoverUploadResult> => {
      let filePath: string | undefined;
      try {
        const result = await uploadTripCoverBlob({
          client: supabase,
          tripId,
          blob,
        });
        filePath = result.filePath;

        if (options.persist) {
          const persisted = await options.persist(result.publicUrl);
          if (!persisted) {
            await supabase.storage
              .from(TRIP_COVER_BUCKET)
              .remove([filePath])
              .catch(() => null);
            return { ok: false, error: 'Failed to save cover photo to trip details' };
          }
          return { ok: true, publicUrl: result.publicUrl };
        }

        // Direct mode: write DB + invalidate query surfaces ourselves.
        const normalizedPublicUrl = normalizeTripCoverUrl(result.publicUrl) ?? result.publicUrl;
        const { data, error } = await supabase
          .from('trips')
          .update({ cover_image_url: normalizedPublicUrl })
          .eq('id', tripId)
          .select('id, cover_image_url')
          .maybeSingle();

        if (error || !data || data.cover_image_url !== normalizedPublicUrl) {
          await supabase.storage
            .from(TRIP_COVER_BUCKET)
            .remove([filePath])
            .catch(() => null);
          return {
            ok: false,
            error: error?.message ?? 'Cover photo saved to storage but DB update failed',
          };
        }

        updateTripCoverCache(queryClient, tripId, normalizedPublicUrl);
        await invalidateTripCoverQueries(queryClient, tripId);

        return { ok: true, publicUrl: normalizedPublicUrl };
      } catch (err) {
        if (filePath) {
          await supabase.storage
            .from(TRIP_COVER_BUCKET)
            .remove([filePath])
            .catch(() => null);
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Cover photo upload failed',
        };
      }
    },
    [queryClient],
  );

  return { upload };
};
