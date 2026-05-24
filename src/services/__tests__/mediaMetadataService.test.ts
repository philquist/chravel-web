import { describe, expect, it } from 'vitest';
import { normalizeMediaMetadata } from '@/services/mediaMetadataService';

describe('normalizeMediaMetadata', () => {
  it('normalizes dimensions, tags, ownership, checksum, and storage path', () => {
    const result = normalizeMediaMetadata({
      ownerUserId: 'user-1',
      checksum: 'abc123',
      uploadPath: 'trip-1/images/photo.jpg',
      width: 100,
      height: 200,
      durationSeconds: 12,
      tags: ['  Beach ', 'beach', '  '],
    });

    expect(result).toEqual({
      dimensions: { width: 100, height: 200 },
      duration_seconds: 12,
      tags: ['beach', 'beach'],
      ownership: { uploaded_by: 'user-1' },
      checksum: 'abc123',
      uploaded_by: 'user-1',
      upload_path: 'trip-1/images/photo.jpg',
    });
  });
});
