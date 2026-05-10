import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TripCoverPhotoUpload } from '../TripCoverPhotoUpload';

const mockUploadTripCoverBlob = vi.fn();
const mockRemove = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'member-1' } }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('../CoverPhotoCropModal', () => ({
  CoverPhotoCropModal: ({
    isOpen,
    onCropComplete,
  }: {
    isOpen: boolean;
    onCropComplete: (blob: Blob) => Promise<boolean>;
  }) =>
    isOpen ? (
      <button onClick={() => void onCropComplete(new Blob(['img'], { type: 'image/jpeg' }))}>
        Confirm Crop
      </button>
    ) : null,
}));

vi.mock('../CoverPhotoFullscreenModal', () => ({
  CoverPhotoFullscreenModal: () => null,
}));

vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: { onDrop: (files: File[]) => void }) => ({
    getRootProps: () => ({
      onClick: () =>
        onDrop([
          new File(['image-bytes'], 'cover.jpg', {
            type: 'image/jpeg',
          }),
        ]),
    }),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock('@/utils/tripCoverStorage', () => ({
  TRIP_COVER_BUCKET: 'trip-covers',
  uploadTripCoverBlob: (...args: unknown[]) => mockUploadTripCoverBlob(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        remove: mockRemove,
      })),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('TripCoverPhotoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadTripCoverBlob.mockResolvedValue({
      publicUrl: 'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-1/cover.jpg',
      filePath: 'trip-1/cover.jpg',
    });
    mockRemove.mockResolvedValue({ data: null, error: null });
  });

  it('cleans up uploaded file when DB cover update fails', async () => {
    const onPhotoUploaded = vi.fn().mockResolvedValue(false);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TripCoverPhotoUpload tripId="trip-1" onPhotoUploaded={onPhotoUploaded} tripName="Trip" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Upload Trip Cover Photo'));
    fireEvent.click(await screen.findByText('Confirm Crop'));

    await waitFor(() => {
      expect(onPhotoUploaded).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledWith(['trip-1/cover.jpg']);
    });
  });
});
