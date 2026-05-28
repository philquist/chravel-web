import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { MediaSubTabs } from '../MediaSubTabs';
import { uploadTripMedia } from '@/services/mediaService';
import { useStorageQuota } from '@/hooks/useStorageQuota';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useResolvedTripMediaUrl', () => ({
  useResolvedTripMediaUrl: () => null,
}));

vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: vi.fn(),
}));

vi.mock('@/services/mediaService', () => ({
  uploadTripMedia: vi.fn(),
  mediaService: { deleteMedia: vi.fn() },
}));

const mockedUseStorageQuota = vi.mocked(useStorageQuota);
const mockedUpload = vi.mocked(uploadTripMedia);

function makeFile(sizeBytes: number, name = 'photo.jpg'): File {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('MediaSubTabs — quota-exceeded upload guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderTab() {
    const { container } = render(
      <MediaSubTabs items={[]} type="photos" searchQuery="" tripId="trip-1" />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    return input;
  }

  it('blocks upload and warns when already over the storage limit', () => {
    mockedUseStorageQuota.mockReturnValue({
      quota: { usedMB: 500, quotaMB: 500, percentUsed: 100, isNearLimit: true, isOverLimit: true },
      loading: false,
      refresh: vi.fn(),
      canUpload: false,
    });

    const input = renderTab();
    fireEvent.change(input, { target: { files: [makeFile(1024 * 1024)] } });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Storage limit reached/i));
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('blocks upload when the incoming batch would exceed remaining quota', () => {
    // 10MB remaining, but the incoming file is 50MB.
    mockedUseStorageQuota.mockReturnValue({
      quota: { usedMB: 490, quotaMB: 500, percentUsed: 98, isNearLimit: true, isOverLimit: false },
      loading: false,
      refresh: vi.fn(),
      canUpload: true,
    });

    const input = renderTab();
    fireEvent.change(input, { target: { files: [makeFile(50 * 1024 * 1024)] } });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Storage limit reached/i));
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
