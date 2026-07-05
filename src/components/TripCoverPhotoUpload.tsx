import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Camera, Check, Crop, Eye, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useDemoMode } from '../hooks/useDemoMode';
import { toast } from 'sonner';
import { CoverPhotoCropModal } from './CoverPhotoCropModal';
import { CoverPhotoFullscreenModal } from './CoverPhotoFullscreenModal';
import { useCoverPhotoUpload } from '@/features/trips/hooks/useCoverPhotoUpload';
import { useGenerateCoverPhoto } from '@/features/trips/hooks/useGenerateCoverPhoto';
import { ImagePrepError, prepareImageForUpload } from '@/utils/imagePrep';
import { isBlobOrDataUrl } from '@/utils/mediaUtils';

interface TripCoverPhotoUploadProps {
  tripId: string;
  currentPhoto?: string;
  onPhotoUploaded: (photoUrl: string) => Promise<boolean>;
  onPhotoRemoved?: () => Promise<boolean>;
  tripName?: string;
  className?: string;
  aspectRatio?: number; // 3 for desktop (3:1), 4/3 for mobile drawer
  displayMode?: 'cover' | 'contain';
}

export const TripCoverPhotoUpload = ({
  tripId,
  currentPhoto,
  onPhotoUploaded,
  onPhotoRemoved,
  tripName,
  className = '',
  aspectRatio = 3, // Default to 3:1 desktop banner
  displayMode = 'contain',
}: TripCoverPhotoUploadProps) => {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { upload: uploadCoverPhoto } = useCoverPhotoUpload();
  const {
    generate: generateAiCover,
    isGenerating,
    remainingThisMonth,
    cap: aiCap,
    isEligible: isFrequentChraveler,
  } = useGenerateCoverPhoto(tripId);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string>('');
  const [hasImageError, setHasImageError] = useState(false);

  const canGenerate = !!user && !isDemoMode && isFrequentChraveler;
  const outOfQuota = canGenerate && remainingThisMonth !== null && remainingThisMonth <= 0;
  const generateDisabled =
    !user ||
    isDemoMode ||
    !isFrequentChraveler ||
    outOfQuota ||
    isGenerating ||
    isUploading ||
    isDeleting;
  const generateTitle = !user
    ? 'Sign in to generate cover photos'
    : isDemoMode
      ? 'AI cover generation is disabled in demo mode'
      : !isFrequentChraveler
        ? 'Upgrade to Frequent Chraveler to generate AI cover photos'
        : outOfQuota
          ? `You've used all ${aiCap} AI covers this month`
          : `Generate an AI cover photo (${remainingThisMonth ?? aiCap} of ${aiCap} left this month)`;

  const handleGenerateAi = useCallback(async () => {
    if (generateDisabled) return;
    const result = await generateAiCover();
    if (result.ok === true) {
      await onPhotoUploaded(result.publicUrl).catch(() => false);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2000);
      toast.success('AI cover photo generated!');
      return;
    }
    const failed = result;
    if (failed.code === 'upgrade_required') {
      toast.error('Upgrade to Frequent Chraveler to generate cover photos.');
    } else if (failed.code === 'quota_exceeded') {
      toast.error(`You've used all ${aiCap} AI covers this month.`);
    } else {
      toast.error(failed.error || 'Cover generation failed.');
    }
  }, [generateDisabled, generateAiCover, onPhotoUploaded, aiCap]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    try {
      // Validate size + reject HEIC + bake in EXIF orientation up front so
      // the crop modal sees a properly-rotated image and the storage upload
      // never receives a format the browser can't render.
      const prepared = await prepareImageForUpload(file);
      const previewUrl = URL.createObjectURL(prepared.blob);
      setSelectedImageSrc(previewUrl);
      setShowCropModal(true);
    } catch (err) {
      const message =
        err instanceof ImagePrepError
          ? err.userMessage
          : "We couldn't use that photo. Try a different one.";
      toast.error(message);
    }
  }, []);

  const handleAdjustPosition = useCallback(() => {
    if (currentPhoto) {
      setSelectedImageSrc(currentPhoto);
      setShowCropModal(true);
    }
  }, [currentPhoto]);

  const handleCropComplete = useCallback(
    async (croppedBlob: Blob) => {
      setIsUploading(true);

      try {
        // Demo mode: use blob URL
        if (isDemoMode || !user) {
          const croppedUrl = URL.createObjectURL(croppedBlob);
          let demoUrlConsumed = false;
          try {
            const success = await onPhotoUploaded(croppedUrl);
            if (success) {
              demoUrlConsumed = true;
              setShowCropModal(false);
              setUploadSuccess(true);
              setTimeout(() => setUploadSuccess(false), 2000);
              if (selectedImageSrc && isBlobOrDataUrl(selectedImageSrc)) {
                URL.revokeObjectURL(selectedImageSrc);
              }
              setSelectedImageSrc('');
            }
            setIsUploading(false);
            return success;
          } finally {
            if (!demoUrlConsumed) {
              URL.revokeObjectURL(croppedUrl);
            }
          }
        }

        const result = await uploadCoverPhoto(tripId, croppedBlob, {
          persist: onPhotoUploaded,
        });
        if (result.ok) {
          setShowCropModal(false);
          setHasImageError(false);
          setUploadSuccess(true);
          setTimeout(() => setUploadSuccess(false), 2000);
          if (selectedImageSrc && isBlobOrDataUrl(selectedImageSrc)) {
            URL.revokeObjectURL(selectedImageSrc);
          }
          setSelectedImageSrc('');
          return true;
        }
        if (import.meta.env.DEV) {
          console.error(
            '[TripCoverPhotoUpload] cover persist failed:',
            (result as { error?: string }).error,
          );
        }
        toast.error(
          "We uploaded the photo, but couldn't attach it to this trip. Please try again.",
        );
        return false;
      } catch (error) {
        console.error('Photo upload error:', error);
        toast.error('Failed to upload cover photo. Please try again.');
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [user, isDemoMode, tripId, onPhotoUploaded, selectedImageSrc, uploadCoverPhoto],
  );

  const handleCropCancel = useCallback(() => {
    setShowCropModal(false);
    if (selectedImageSrc && isBlobOrDataUrl(selectedImageSrc)) {
      URL.revokeObjectURL(selectedImageSrc);
    }
    setSelectedImageSrc('');
  }, [selectedImageSrc]);

  const handleViewFullscreen = useCallback(() => {
    if (currentPhoto) {
      setShowFullscreenModal(true);
    }
  }, [currentPhoto]);

  const handleDeletePhoto = useCallback(async () => {
    if (!onPhotoRemoved) return;

    setIsDeleting(true);
    try {
      const success = await onPhotoRemoved();
      if (success) {
        toast.success('Cover photo removed');
      }
    } catch (error) {
      console.error('Error removing photo:', error);
      toast.error('Failed to remove cover photo');
    } finally {
      setIsDeleting(false);
    }
  }, [onPhotoRemoved]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: rejections => {
      const first = rejections[0]?.errors[0];
      if (!first) return;
      if (first.code === 'file-too-large') {
        toast.error('That photo is over 10MB. Please pick a smaller image.');
      } else if (first.code === 'file-invalid-type') {
        toast.error('Unsupported file type. Use JPG, PNG, GIF, or WebP.');
      } else {
        toast.error(first.message || "We couldn't use that photo.");
      }
    },
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  React.useEffect(() => {
    setHasImageError(false);
  }, [currentPhoto]);

  return (
    <>
      {currentPhoto && !hasImageError ? (
        <div className={`relative group overflow-hidden rounded-2xl ${className}`}>
          {displayMode === 'contain' && (
            <img
              src={currentPhoto}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-45"
            />
          )}
          <img
            src={currentPhoto}
            alt={`Cover photo for trip ${tripId}`}
            className={`w-full h-full cursor-pointer ${
              displayMode === 'contain' ? 'object-contain relative z-[1]' : 'object-cover'
            }`}
            onError={() => setHasImageError(true)}
            onClick={handleViewFullscreen}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center gap-3">
            {/* View full photo button */}
            <button
              onClick={handleViewFullscreen}
              disabled={isUploading || isDeleting}
              className="cursor-pointer bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:bg-white/30 transition-colors disabled:opacity-50"
            >
              <Eye size={16} />
              <span className="text-sm font-medium">View Full Photo</span>
            </button>
            {/* Edit controls row */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button
                onClick={handleAdjustPosition}
                disabled={isUploading || isDeleting}
                className="cursor-pointer bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:bg-white/30 transition-colors disabled:opacity-50"
              >
                <Crop size={16} />
                <span className="text-sm font-medium">Adjust Position</span>
              </button>
              <div
                {...getRootProps()}
                className="cursor-pointer bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:bg-white/30 transition-colors"
              >
                <input {...getInputProps()} />
                <Camera size={16} />
                <span className="text-sm font-medium">Change Photo</span>
              </div>
              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={generateDisabled}
                title={generateTitle}
                className="cursor-pointer bg-gradient-to-r from-amber-500/40 to-yellow-400/40 backdrop-blur-sm border border-amber-300/50 rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:from-amber-500/60 hover:to-yellow-400/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 animate-spin gold-gradient-spinner" />
                    <span className="text-sm font-medium">Generating…</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">Generate with AI</span>
                  </>
                )}
              </button>
            </div>
            {canGenerate && remainingThisMonth !== null && (
              <p className="text-xs text-white/70">
                {remainingThisMonth} of {aiCap} AI covers left this month
              </p>
            )}
            {/* Delete button */}
            {onPhotoRemoved && (
              <button
                onClick={handleDeletePhoto}
                disabled={isUploading || isDeleting}
                className="cursor-pointer bg-red-500/30 backdrop-blur-sm border border-red-400/50 rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:bg-red-500/50 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 animate-spin gold-gradient-spinner" />
                    <span className="text-sm font-medium">Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span className="text-sm font-medium">Delete Photo</span>
                  </>
                )}
              </button>
            )}
          </div>
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
              <div className="text-white text-center">
                <div className="w-8 h-8 animate-spin gold-gradient-spinner mx-auto mb-2"></div>
                <span className="text-sm">Uploading...</span>
              </div>
            </div>
          )}
          {uploadSuccess && (
            <div className="absolute inset-0 bg-green-500/60 rounded-2xl flex items-center justify-center">
              <div className="text-white text-center">
                <Check size={32} className="mx-auto mb-2" />
                <span className="text-sm font-medium">Photo Updated!</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={`space-y-3 ${className}`}>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed border-white/30 rounded-2xl p-8 text-center cursor-pointer transition-all hover:border-white/50 hover:bg-white/5 min-h-[192px] ${isDragActive ? 'border-blue-400 bg-blue-400/10' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="text-white">
              <Upload size={48} className="mx-auto mb-4 text-white/70" />
              <h3 className="text-lg font-semibold mb-2">Upload Trip Cover Photo</h3>
              <p className="text-gray-300 text-sm mb-4">
                {isDragActive
                  ? 'Drop your photo here...'
                  : 'Drag & drop a photo here, or click to browse'}
              </p>
              <p className="text-gray-400 text-xs">Supports PNG, JPG, GIF • Max 10MB</p>
              {!user && (
                <p className="text-yellow-400 text-xs mt-2">
                  Demo mode: Photos will be shown temporarily. Sign in for full functionality.
                </p>
              )}
            </div>
            {isUploading && (
              <div className="mt-4">
                <div className="w-8 h-8 animate-spin gold-gradient-spinner mx-auto mb-2"></div>
                <span className="text-sm text-white">Uploading...</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleGenerateAi}
            disabled={generateDisabled}
            title={generateTitle}
            className="w-full cursor-pointer bg-gradient-to-r from-amber-500/30 to-yellow-400/30 backdrop-blur-sm border border-amber-300/40 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-white hover:from-amber-500/50 hover:to-yellow-400/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 animate-spin gold-gradient-spinner" />
                <span className="text-sm font-medium">Generating your cover…</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">
                  Generate with AI
                  {canGenerate && remainingThisMonth !== null
                    ? ` · ${remainingThisMonth}/${aiCap} left`
                    : !isFrequentChraveler
                      ? ' · Frequent Chraveler'
                      : ''}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Crop Modal */}
      {selectedImageSrc && (
        <CoverPhotoCropModal
          isOpen={showCropModal}
          onClose={handleCropCancel}
          imageSrc={selectedImageSrc}
          onCropComplete={handleCropComplete}
          aspectRatio={aspectRatio}
          displayMode={displayMode}
        />
      )}

      {/* Fullscreen View Modal */}
      {currentPhoto && (
        <CoverPhotoFullscreenModal
          isOpen={showFullscreenModal}
          onClose={() => setShowFullscreenModal(false)}
          imageSrc={currentPhoto}
          tripName={tripName}
        />
      )}
    </>
  );
};
