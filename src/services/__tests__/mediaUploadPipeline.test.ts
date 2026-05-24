import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  computeFileChecksum,
  createUploadJob,
  detectDuplicateMedia,
  executeUploadJob,
} from '@/services/mediaUploadPipeline';

vi.mock('@/services/uploadService', () => ({
  uploadToStorage: vi.fn(),
  insertMediaIndex: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [{ id: 'dup' }], error: null })),
          })),
        })),
      })),
    })),
  },
}));

import { insertMediaIndex, uploadToStorage } from '@/services/uploadService';

const uploadMock = vi.mocked(uploadToStorage);
const insertMock = vi.mocked(insertMediaIndex);
const createMockFile = (name: string, type: string, body: string): File =>
  ({
    name,
    type,
    size: body.length,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }) as unknown as File;

describe('mediaUploadPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries on flaky network and eventually succeeds', async () => {
    uploadMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ key: 'trip/images/a.jpg', publicUrl: 'https://cdn/a.jpg' });
    insertMock.mockResolvedValue({ id: 'm1' } as never);

    const file = createMockFile('a.jpg', 'image/jpeg', 'abc');
    const checksum = await computeFileChecksum(file);
    const job = createUploadJob({ tripId: 'trip1', file, mediaType: 'image', checksum });

    const result = await executeUploadJob(job);
    expect(result.state).toBe('ready');
    expect(result.attempts).toBe(2);
  });

  it('marks interrupted upload as failed after bounded attempts', async () => {
    uploadMock.mockRejectedValue(new Error('interrupted'));

    const file = createMockFile('a.jpg', 'image/jpeg', 'abc');
    const checksum = await computeFileChecksum(file);
    const job = createUploadJob({ tripId: 'trip1', file, mediaType: 'image', checksum });

    const result = await executeUploadJob(job);
    expect(result.state).toBe('failed');
    expect(result.attempts).toBe(3);
  });

  it('detects duplicate media by checksum', async () => {
    const isDuplicate = await detectDuplicateMedia('trip1', 'hash');
    expect(isDuplicate).toBe(true);
  });
});
