export interface MediaMetadataWrite {
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags?: string[];
  ownerUserId: string;
  checksum: string;
}

export function normalizeMediaMetadata(payload: MediaMetadataWrite): Record<string, unknown> {
  return {
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
  };
}
