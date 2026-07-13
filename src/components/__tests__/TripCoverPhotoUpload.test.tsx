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

// prepareImageForUpload does canvas/EXIF work that jsdom can't run; mock it so
// the drop handler reaches the crop modal instead of erroring out up front.
vi.mock('@/utils/imagePrep', () => ({
  ImagePrepError: class ImagePrepError extends Error {},
  prepareImageForUpload: vi.fn().mockResolvedValue({
    blob: new Blob(['img'], { type: 'image/jpeg' }),
    fileName: 'cover.jpg',
    contentType: 'image/jpeg',
  }),
}));

vi.mock('@/features/trips/hooks/useCoverPhotoUpload', () => ({
  useCoverPhotoUpload: () => ({
    upload: async (
      tripId: string,
      _blob: Blob,
      options: { persist?: (publicUrl: string) => Promise<boolean> } = {},
    ) => {
      const result = await mockUploadTripCoverBlob({ tripId });
      if (options.persist) {
        const persisted = await options.persist(result.publicUrl);
        if (!persisted) {
          await mockRemove([result.filePath]);
          return { ok: false as const, error: 'Failed to save cover photo to trip details' };
        }
      }
      return { ok: true as const, publicUrl: result.publicUrl };
    },
  }),
}));

vi.mock('@/features/trips/hooks/useGenerateCoverPhoto', () => ({
  useGenerateCoverPhoto: () => ({
    generate: vi.fn(),
    isGenerating: false,
    remainingThisMonth: 3,
    cap: 3,
    isEligible: true,
  }),
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
    // jsdom has no object-URL implementation; the component creates/revokes them
    // for the crop preview.
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
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

  it('shows the truthful "could not attach" copy when the trip-detail save fails', async () => {
    // Regression: the storage upload succeeds but persisting to the trip record
    // fails (e.g. the RLS infinite-recursion bug fixed in
    // 20260603120000_fix_trips_rls_infinite_recursion). The toast must not claim
    // success, and must point the user at retrying the attach step.
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
      expect(mockToastError).toHaveBeenCalledWith(
        "We uploaded the photo, but couldn't attach it to this trip. Please try again.",
      );
    });
  });
});
