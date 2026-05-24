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

const getUserMock = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }));
const duplicateLookupMock = vi.fn(async () => ({ data: [] as { id: string }[], error: null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => getUserMock(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: () => duplicateLookupMock(),
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
    duplicateLookupMock.mockResolvedValue({ data: [], error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
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
    duplicateLookupMock.mockResolvedValueOnce({ data: [{ id: 'dup' }], error: null });
    const isDuplicate = await detectDuplicateMedia('trip1', 'hash');
    expect(isDuplicate).toBe(true);
  });

  it('fails fast when duplicate checksum exists before upload', async () => {
    duplicateLookupMock.mockResolvedValueOnce({ data: [{ id: 'dup' }], error: null });

    const file = createMockFile('a.jpg', 'image/jpeg', 'abc');
    const checksum = await computeFileChecksum(file);
    const job = createUploadJob({ tripId: 'trip1', file, mediaType: 'image', checksum });

    const result = await executeUploadJob(job);
    expect(result.state).toBe('failed');
    expect(result.error).toContain('Duplicate');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('retries insert without re-uploading storage when upload already succeeded', async () => {
    uploadMock.mockResolvedValue({ key: 'trip/images/a.jpg', publicUrl: 'https://cdn/a.jpg' });
    insertMock.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ id: 'm1' } as never);

    const file = createMockFile('a.jpg', 'image/jpeg', 'unique-body');
    const checksum = await computeFileChecksum(file);
    const job = createUploadJob({ tripId: 'trip1', file, mediaType: 'image', checksum });

    const result = await executeUploadJob(job);
    expect(result.state).toBe('ready');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadPath: 'trip/images/a.jpg',
        checksum,
        uploadedBy: 'user-1',
      }),
    );
  });
});
