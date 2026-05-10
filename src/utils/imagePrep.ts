/**
 * Shared image-prep pipeline for cover photos / avatars / media uploads
 * across web + PWA + iOS Safari + Android Chrome.
 *
 * Responsibilities:
 *   1. Enforce a hard byte limit with a clear, user-readable error.
 *   2. Reject HEIC/HEIF — browsers (and our Supabase render layer) cannot
 *      decode it, and silently uploading produces broken thumbnails.
 *   3. Normalize EXIF orientation by re-encoding through `createImageBitmap`
 *      so iPhone portrait photos don't render rotated 90°.
 *
 * Returns a fresh JPEG/PNG `Blob` plus a safe filename. Callers should pass
 * the returned blob+contentType to `uploadTripCoverBlob`.
 */

import { MAX_TRIP_COVER_BYTES } from './tripCoverStorage';

export const SUPPORTED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const HEIC_MIME = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);
const HEIC_EXT = /\.(heic|heif)$/i;

export class ImagePrepError extends Error {
  constructor(
    public readonly userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = 'ImagePrepError';
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

export interface PreparedImage {
  blob: Blob;
  fileName: string;
  contentType: string;
  width?: number;
  height?: number;
}

export interface PrepareImageOptions {
  /** Hard byte ceiling. Defaults to the trip-cover limit (10MB). */
  maxBytes?: number;
  /** Output container when re-encoded. Defaults to `image/jpeg`. */
  reencodeAs?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** JPEG/WebP quality when re-encoding (0–1). Defaults to 0.92. */
  quality?: number;
}

function friendlyBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isHeic(file: File): boolean {
  return HEIC_MIME.has(file.type.toLowerCase()) || HEIC_EXT.test(file.name);
}

/**
 * Normalize, validate, and EXIF-orient an image File for upload.
 * Throws `ImagePrepError` with a user-presentable message on any failure.
 */
export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {},
): Promise<PreparedImage> {
  const maxBytes = options.maxBytes ?? MAX_TRIP_COVER_BYTES;

  // 1) Size guard — fail fast before any decode work.
  if (file.size > maxBytes) {
    throw new ImagePrepError(
      `That photo is ${friendlyBytes(file.size)}. Please pick one under ${friendlyBytes(maxBytes)}.`,
    );
  }
  if (file.size === 0) {
    throw new ImagePrepError('That file looks empty. Please pick a different photo.');
  }

  // 2) HEIC guard — common iPhone default. Browsers cannot decode it; we
  //    surface a clear, actionable error instead of uploading broken bytes.
  if (isHeic(file)) {
    throw new ImagePrepError(
      "HEIC photos from iPhone can't be uploaded directly. In Photos, share the image as JPEG, or change your iPhone Camera setting to 'Most Compatible'.",
    );
  }

  // 3) Type guard — only accept formats the storage layer supports.
  const incomingType = file.type.toLowerCase();
  if (incomingType && !SUPPORTED_IMAGE_MIME.has(incomingType)) {
    throw new ImagePrepError(
      `That file type (${incomingType || 'unknown'}) isn't supported. Use JPG, PNG, GIF, or WebP.`,
    );
  }

  // 4) EXIF orientation normalization via `createImageBitmap`. Modern
  //    browsers (Chrome 81+, Safari 13.4+, Firefox 77+) honor
  //    `imageOrientation: 'from-image'` and bake the rotation in.
  //    GIFs are passthrough — re-encoding would lose animation.
  if (incomingType === 'image/gif') {
    return {
      blob: file,
      fileName: file.name || 'cover.gif',
      contentType: 'image/gif',
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    // Older Safari fallback: try without the option.
    try {
      bitmap = await createImageBitmap(file);
    } catch (innerErr) {
      throw new ImagePrepError(
        "We couldn't read that image. Try a different photo (JPG or PNG works best).",
        innerErr,
      );
    }
  }

  const reencodeAs = options.reencodeAs ?? 'image/jpeg';
  const quality = options.quality ?? 0.92;

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new ImagePrepError(
      "Your browser couldn't process that photo. Try another browser or device.",
    );
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const blob: Blob = (await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      reencodeAs,
      quality,
    );
  }).catch(err => {
    throw new ImagePrepError(
      "We couldn't save the rotated photo. Please try a different image.",
      err,
    );
  })) as Blob;

  // Post-encode size re-check — orientation-baked JPEGs can occasionally
  // grow vs. an over-compressed source.
  if (blob.size > maxBytes) {
    throw new ImagePrepError(
      `Photo is too large after processing (${friendlyBytes(blob.size)}). Please pick one under ${friendlyBytes(maxBytes)}.`,
    );
  }

  const ext = reencodeAs === 'image/png' ? 'png' : reencodeAs === 'image/webp' ? 'webp' : 'jpg';
  const baseName = (file.name || 'cover').replace(/\.[^.]+$/, '');
  return {
    blob,
    fileName: `${baseName}.${ext}`,
    contentType: reencodeAs,
    width: canvas.width,
    height: canvas.height,
  };
}
