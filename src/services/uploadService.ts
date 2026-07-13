import { supabase } from '@/integrations/supabase/client';
import imageCompression from 'browser-image-compression';
import { getUploadContentType } from '@/utils/mime';
import { FREEMIUM_LIMITS, type FreemiumTier } from '@/utils/featureTiers';
import { resolveEffectiveTier } from './entitlementService';
import { normalizeMediaMetadata } from './mediaMetadataService';

// Generate UUID using crypto API
const uuid = () => crypto.randomUUID();

export type MediaType = 'image' | 'video';
export type FileUpload = File & { mime?: string };

export class StorageQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

export class MediaCountExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaCountExceededError';
  }
}

/**
 * Resolve the user's freemium tier from their profile.
 * Returns 'free' if lookup fails (safe default — most restrictive).
 */
export function mapEntitlementTierToFreemiumTier(tier: string): FreemiumTier {
  if (tier === 'free') return 'free';
  if (tier === 'explorer') return 'explorer';
  return 'frequent-chraveler';
}

async function resolveUserTier(userId: string): Promise<FreemiumTier> {
  const tier = await resolveEffectiveTier(userId);
  return mapEntitlementTierToFreemiumTier(tier);
}

/**
 * Pre-upload enforcement: checks storage quota (MB) and per-trip media count limits.
 * Throws StorageQuotaExceededError or MediaCountExceededError if limits are exceeded.
 */
async function enforceUploadLimits(
  tripId: string,
  subdir: 'images' | 'videos' | 'files',
  fileSizeBytes: number,
): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) return; // auth guard handled elsewhere

  const tier = await resolveUserTier(userId);
  const limits = FREEMIUM_LIMITS[tier];

  // 1. Storage quota check (account-wide MB limit).
  // Uploader identity lives in metadata.uploaded_by — both insert paths
  // (insertMediaIndex via normalizeMediaMetadata, and mediaService) write that key;
  // the dedicated uploaded_by column is never populated by clients, so filtering on
  // it would count zero rows and silently disable enforcement.
  if (limits.storageAccountMB !== -1) {
    const { data: mediaData, error: storageQueryError } = await supabase
      .from('trip_media_index')
      .select('file_size')
      .eq('metadata->>uploaded_by', userId);

    if (storageQueryError) {
      // Fail open: never block an upload because the usage lookup failed.
      if (import.meta.env.DEV)
        console.error('[uploadService] Storage usage lookup failed:', storageQueryError);
    } else {
      const usedBytes = (mediaData ?? []).reduce(
        (sum: number, item: { file_size: number | null }) => sum + (item.file_size ?? 0),
        0,
      );
      const usedMB = usedBytes / (1024 * 1024);
      const fileMB = fileSizeBytes / (1024 * 1024);

      if (usedMB + fileMB > limits.storageAccountMB) {
        throw new StorageQuotaExceededError(
          `Storage quota exceeded. You've used ${Math.round(usedMB)}MB of ${limits.storageAccountMB}MB. Upgrade your plan for more storage.`,
        );
      }
    }
  }

  // 2. Per-trip media count check — per uploader, NOT trip-wide. Each member's
  // own uploads count against their own tier limit, so a 10-person free group
  // gets 10 × 5 photos and one member upgrading lifts only their own cap.
  const mediaTypeKey =
    subdir === 'images' ? 'photosPerTrip' : subdir === 'videos' ? 'videosPerTrip' : 'filesPerTrip';
  const countLimit = limits[mediaTypeKey];

  if (countLimit !== -1) {
    const mediaType = subdir === 'images' ? 'image' : subdir === 'videos' ? 'video' : null;

    let count = 0;
    if (mediaType) {
      const { count: mediaCount, error: countError } = await supabase
        .from('trip_media_index')
        .select('*', { count: 'exact', head: true })
        .eq('trip_id', tripId)
        .eq('media_type', mediaType)
        .eq('metadata->>uploaded_by', userId);
      if (countError) {
        // Fail open on count errors — never block an upload on a failed lookup.
        if (import.meta.env.DEV)
          console.error('[uploadService] Media count lookup failed:', countError);
        return;
      }
      count = mediaCount ?? 0;
    } else {
      // files — count from trip_files table (uploaded_by is a real column there)
      const { count: fileCount, error: fileCountError } = await supabase
        .from('trip_files')
        .select('*', { count: 'exact', head: true })
        .eq('trip_id', tripId)
        .eq('uploaded_by', userId);
      if (fileCountError) {
        if (import.meta.env.DEV)
          console.error('[uploadService] File count lookup failed:', fileCountError);
        return;
      }
      count = fileCount ?? 0;
    }

    if (count >= countLimit) {
      const typeLabel = subdir === 'images' ? 'photos' : subdir;
      throw new MediaCountExceededError(
        `You've reached your limit of ${countLimit} ${typeLabel} per trip on your current plan. Upgrade for unlimited uploads.`,
      );
    }
  }
}

export async function uploadToStorage(
  file: FileUpload,
  tripId: string,
  subdir: 'images' | 'videos' | 'files',
) {
  // Enforce storage and media count limits before uploading
  await enforceUploadLimits(tripId, subdir, file.size);

  let fileToUpload: File | Blob = file;

  // Compress images before upload
  if (subdir === 'images' && file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: file.type,
      };
      fileToUpload = await imageCompression(file, options);
      if (import.meta.env.DEV) {
        console.log('Image compressed:', {
          original: (file.size / 1024 / 1024).toFixed(2) + 'MB',
          compressed: (fileToUpload.size / 1024 / 1024).toFixed(2) + 'MB',
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Failed to compress image, uploading original:', error);
      fileToUpload = file;
    }
  }

  const id = uuid();
  const ext = file.name.split('.').pop() ?? 'bin';
  // Storage RLS requires `${tripId}/${auth.uid()}/...` as the object key.
  const { data: authData } = await supabase.auth.getUser();
  const uploaderId = authData?.user?.id;
  if (!uploaderId) throw new Error('You must be signed in to upload media.');
  const key = `${tripId}/${uploaderId}/${subdir}/${id}.${ext}`;

  const contentType = getUploadContentType(file);

  const { data: _data, error } = await supabase.storage
    .from('trip-media')
    .upload(key, fileToUpload, {
      contentType,
      upsert: false,
    });

  if (error) throw error;
  const { data: pub } = supabase.storage.from('trip-media').getPublicUrl(key);
  return { key, publicUrl: pub.publicUrl };
}

/**
 * Upload a voice note into the dedicated `trip-voice-notes` bucket.
 * Path mirrors trip-media: {tripId}/{userId}/{uuid}.{ext}
 */
export async function uploadVoiceNoteToStorage(file: FileUpload, tripId: string) {
  await enforceUploadLimits(tripId, 'files', file.size);

  const id = uuid();
  const ext = file.name.split('.').pop() ?? 'webm';
  const { data: authData } = await supabase.auth.getUser();
  const uploaderId = authData?.user?.id;
  if (!uploaderId) throw new Error('You must be signed in to upload media.');
  const key = `${tripId}/${uploaderId}/${id}.${ext}`;
  const contentType = getUploadContentType(file) || file.type || 'audio/webm';

  const { error } = await supabase.storage.from('trip-voice-notes').upload(key, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  // Private bucket — create a long-lived signed URL for Stream attachment playback.
  const { data: signed, error: signError } = await supabase.storage
    .from('trip-voice-notes')
    .createSignedUrl(key, 60 * 60 * 24 * 365); // 1 year
  if (signError || !signed?.signedUrl) {
    throw signError || new Error('Failed to create voice note URL');
  }

  return { key, publicUrl: signed.signedUrl };
}

export async function insertMediaIndex(params: {
  tripId: string;
  // 'document' is accepted for non-image/video assets (e.g. PDFs) that still belong in the
  // unified media index. The exported `MediaType` stays image|video for existing callers.
  mediaType: MediaType | 'document';
  url: string;
  uploadPath?: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  messageId?: string;
  uploadedBy?: string;
  checksum?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags?: string[];
  /** Extra source-context fields merged into the stored metadata (e.g. payment provenance). */
  extraMetadata?: Record<string, unknown>;
}) {
  const normalizedMimeType =
    params.mimeType && params.mimeType.length > 0 ? params.mimeType : undefined;
  const { data, error } = await (supabase as any)
    .from('trip_media_index')
    .insert({
      trip_id: params.tripId,
      media_type: params.mediaType,
      media_url: params.url,
      filename: params.filename ?? null,
      file_size: params.fileSize ?? null,
      mime_type: normalizedMimeType ?? null,
      message_id: params.messageId ?? null,
      metadata: {
        ...normalizeMediaMetadata({
          ownerUserId: params.uploadedBy ?? 'unknown',
          checksum: params.checksum ?? '',
          uploadPath: params.uploadPath,
          width: params.width,
          height: params.height,
          durationSeconds: params.durationSeconds,
          tags: params.tags,
        }),
        ...(params.extraMetadata ?? {}),
      },
      caption: null,
      tags: [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertFileIndex(params: {
  tripId: string;
  name: string;
  fileType: string;
  uploadedBy: string;
}) {
  const { data, error } = await supabase
    .from('trip_files')
    .insert({
      trip_id: params.tripId,
      name: params.name,
      file_type: params.fileType,
      uploaded_by: params.uploadedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
