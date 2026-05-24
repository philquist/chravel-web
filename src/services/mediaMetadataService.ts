export interface MediaMetadataWrite {
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags?: string[];
  ownerUserId: string;
  checksum: string;
  /** Storage object key in trip-media bucket (required for archive/signing flows). */
  uploadPath?: string;
}

export function normalizeMediaMetadata(payload: MediaMetadataWrite): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    dimensions:
      typeof payload.width === 'number' && typeof payload.height === 'number'
        ? { width: payload.width, height: payload.height }
        : null,
    duration_seconds:
      typeof payload.durationSeconds === 'number' && payload.durationSeconds >= 0
        ? payload.durationSeconds
        : null,
    tags: (payload.tags ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean),
    ownership: {
      uploaded_by: payload.ownerUserId,
    },
    checksum: payload.checksum,
    // Top-level uploaded_by keeps parity with legacy trip_media_index.metadata rows.
    uploaded_by: payload.ownerUserId,
  };

  if (payload.uploadPath && payload.uploadPath.length > 0) {
    normalized.upload_path = payload.uploadPath;
  }

  return normalized;
}
