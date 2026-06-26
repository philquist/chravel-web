import { supabase } from '@/integrations/supabase/client';
import { uploadToStorage, insertMediaIndex, type MediaType } from '@/services/uploadService';

export type UploadState = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface UploadJob {
  id: string;
  tripId: string;
  file: File;
  mediaType: MediaType;
  state: UploadState;
  attempts: number;
  checksum: string;
  error?: string;
  mediaRow?: Record<string, unknown>;
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

export async function computeFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function detectDuplicateMedia(tripId: string, checksum: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('trip_media_index')
    .select('id')
    .eq('trip_id', tripId)
    .eq('metadata->>checksum', checksum)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function executeUploadJob(job: UploadJob): Promise<UploadJob> {
  if (job.checksum) {
    const isDuplicate = await detectDuplicateMedia(job.tripId, job.checksum);
    if (isDuplicate) {
      return { ...job, state: 'failed', error: 'Duplicate media already exists for this trip' };
    }
  }

  let next: UploadJob = { ...job, state: 'uploading' };
  let cachedUpload: { key: string; publicUrl: string } | null = null;

  while (next.attempts < MAX_ATTEMPTS) {
    try {
      next = { ...next, attempts: next.attempts + 1, state: 'uploading', error: undefined };

      if (!cachedUpload) {
        const subdir = next.mediaType === 'image' ? 'images' : 'videos';
        cachedUpload = await uploadToStorage(next.file, next.tripId, subdir);
      }

      next = { ...next, state: 'processing' };

      const { data: authData } = await supabase.auth.getUser();
      const uploadedBy = authData?.user?.id;

      const mediaRow = await insertMediaIndex({
        tripId: next.tripId,
        mediaType: next.mediaType,
        url: cachedUpload.publicUrl,
        uploadPath: cachedUpload.key,
        filename: next.file.name,
        fileSize: next.file.size,
        mimeType: next.file.type,
        checksum: next.checksum,
        uploadedBy,
      });

      return { ...next, state: 'ready', mediaRow: mediaRow as Record<string, unknown> };
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Upload failed';
      if (next.attempts >= MAX_ATTEMPTS) {
        return { ...next, state: 'failed', error: err };
      }
      await sleep(RETRY_BASE_MS * 2 ** (next.attempts - 1));
    }
  }

  return { ...next, state: 'failed', error: next.error ?? 'Upload failed' };
}

export function createUploadJob(params: {
  tripId: string;
  file: File;
  mediaType: MediaType;
  checksum: string;
}): UploadJob {
  return {
    id: crypto.randomUUID(),
    tripId: params.tripId,
    file: params.file,
    mediaType: params.mediaType,
    checksum: params.checksum,
    state: 'queued',
    attempts: 0,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
