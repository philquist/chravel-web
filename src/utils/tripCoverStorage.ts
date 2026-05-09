import { isBlobOrDataUrl } from './mediaUtils';
import { inferMimeTypeFromFilename } from './mime';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const TRIP_COVER_BUCKET = 'trip-covers';

const DEFAULT_UPLOAD_RETRIES = 3;
export const MAX_TRIP_COVER_BYTES = 10 * 1024 * 1024;

const COVER_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function buildTripCoverStoragePath(tripId: string, fileName: string): string {
  return `${tripId}/${fileName}`;
}

interface UploadTripCoverBlobParams {
  client: SupabaseClient<Database>;
  tripId: string;
  blob: Blob;
  fileName?: string;
  contentType?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface UploadTripCoverBlobResult {
  publicUrl: string;
  filePath: string;
}

export async function uploadTripCoverBlob({
  client,
  tripId,
  blob,
  fileName: sourceFileName,
  contentType: sourceContentType,
  maxRetries = DEFAULT_UPLOAD_RETRIES,
  retryDelayMs,
}: UploadTripCoverBlobParams): Promise<UploadTripCoverBlobResult> {
  const contentType = sourceContentType || blob.type || inferMimeTypeFromFilename(sourceFileName ?? '');
  if (!contentType || !COVER_EXTENSION_BY_MIME[contentType]) {
    throw new Error('Unsupported cover photo type. Use JPG, PNG, GIF, or WebP.');
  }
  if (blob.size > MAX_TRIP_COVER_BYTES) {
    throw new Error('Cover photo is too large. Use an image under 10MB.');
  }

  const fileName = `cover-${Date.now()}-${crypto.randomUUID()}.${COVER_EXTENSION_BY_MIME[contentType]}`;
  const filePath = buildTripCoverStoragePath(tripId, fileName);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error } = await client.storage.from(TRIP_COVER_BUCKET).upload(filePath, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType,
      });

      if (error) {
        lastError = new Error(error.message);
      } else {
        const { data } = client.storage.from(TRIP_COVER_BUCKET).getPublicUrl(filePath);
        if (data.publicUrl) {
          return { publicUrl: data.publicUrl, filePath };
        }
        lastError = new Error('No URL returned from upload');
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Cover upload failed');
    }

    if (attempt < maxRetries) {
      const delayMs = retryDelayMs ?? 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error('Cover upload failed');
}

/**
 * Normalize legacy/signed cover URLs into stable public cover URLs when possible.
 *
 * Why:
 * - Historical rows sometimes stored signed object URLs (`/object/sign/...`) that expire.
 * - `trip-covers/*` objects are intentionally public-read, so signed URLs are unnecessary.
 * - Converting to `/object/public/...` prevents "works once then breaks later" cover loads.
 */
export function normalizeTripCoverUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (isBlobOrDataUrl(url)) return url;

  try {
    const parsed = new URL(url);
    const signedPrefix = `/storage/v1/object/sign/${TRIP_COVER_BUCKET}/`;
    const publicPrefix = `/storage/v1/object/public/${TRIP_COVER_BUCKET}/`;

    if (!parsed.pathname.includes(signedPrefix)) {
      return url;
    }

    const uploadPath = decodeURIComponent(parsed.pathname.split(signedPrefix)[1] ?? '');
    if (!uploadPath) {
      return url;
    }

    return `${parsed.origin}${publicPrefix}${encodeURIComponent(uploadPath).replace(/%2F/g, '/')}`;
  } catch {
    return url;
  }
}

/**
 * Append a cache-busting query param so freshly-replaced covers bypass any
 * browser/CDN cache that may have keyed on a previous URL.
 *
 * - Skips blob/data URLs (already unique per session).
 * - Replaces any existing `?v=` so we don't accumulate params.
 * - `version` is normally a timestamp (ms) or trip `updated_at`.
 *
 * Note: uploads already write to a unique path
 * (`cover-${ts}-${uuid}.ext`), so the URL changes on every replace.
 * This helper is a defensive belt-and-suspenders for legacy rows that
 * may still point at a stable filename and for aggressive edge caches.
 */
export function appendCoverCacheBust(
  url?: string | null,
  version?: string | number | null,
): string | undefined {
  if (!url) return undefined;
  if (isBlobOrDataUrl(url)) return url;
  if (version === undefined || version === null || version === '') return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', String(version));
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(String(version))}`;
  }
}
