import { useState } from 'react';
import {
  uploadToStorage,
  uploadVoiceNoteToStorage,
  insertMediaIndex,
  insertFileIndex,
} from '@/services/uploadService';
import { insertLinkIndex, fetchOpenGraphData } from '@/services/linkService';
import { sendTripMessageWithCanonicalTransport } from '@/services/stream/canonicalTripMessageTransport';
import { autoParseContent, ParsedContent } from '@/services/chatContentParser';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type ShareKind = 'image' | 'video' | 'file' | 'link';

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'uploading' | 'completed' | 'error';
}

export interface VoiceNoteShareMeta {
  durationMs: number;
  waveform: number[];
  /** Optional browser speech-recognition transcript captured while recording. */
  transcript?: string;
}

export function useShareAsset(tripId: string) {
  const [isUploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [parsedContent, setParsedContent] = useState<ParsedContent | null>(null);
  const { user } = useAuth();
  const userId = user?.id || '';

  async function sendMessageWithCanonicalTransport(payload: Record<string, unknown>) {
    return sendTripMessageWithCanonicalTransport(tripId, payload);
  }

  async function shareFile(
    kind: ShareKind,
    file: File,
    onProgress?: (progress: number) => void,
    voiceMeta?: VoiceNoteShareMeta,
  ) {
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setUploading(true);
    setError(null);

    // Initialize progress tracking
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: {
        fileId,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
      },
    }));

    // Simulate progress updates (Supabase doesn't provide native progress)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        const current = prev[fileId];
        if (current && current.progress < 90) {
          const newProgress = Math.min(current.progress + 10, 90);
          if (onProgress) onProgress(newProgress);
          return {
            ...prev,
            [fileId]: { ...current, progress: newProgress },
          };
        }
        return prev;
      });
    }, 200);

    try {
      // 1) Upload to storage
      const subdir = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'files';
      const { publicUrl, key } = await uploadToStorage(file, tripId, subdir);

      // Mark as completed
      clearInterval(progressInterval);
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: {
          fileId,
          fileName: file.name,
          progress: 100,
          status: 'completed',
        },
      }));
      if (onProgress) onProgress(100);

      // 2) Create index record and chat message
      if (kind === 'image' || kind === 'video') {
        const row = await insertMediaIndex({
          tripId,
          mediaType: kind,
          url: publicUrl,
          uploadPath: key,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: userId,
        });

        // Create chat message with attachment
        const messageResult = await sendMessageWithCanonicalTransport({
          trip_id: tripId,
          user_id: userId,
          author_name: user?.email?.split('@')[0] || 'Former Member',
          content: '', // Empty content for pure media upload
          privacy_mode: 'standard',
          media_type: kind,
          media_url: publicUrl,
          attachments: [
            {
              type: kind,
              ref_id: row.id,
              url: publicUrl,
            },
          ],
        });

        // 🆕 Auto-parse content for receipts and itineraries
        if (kind === 'image') {
          try {
            const parsed = await autoParseContent(
              publicUrl,
              'image',
              file.type,
              tripId,
              (messageResult as any)?.id?.toString(),
            );
            if (parsed && parsed.suggestions && parsed.suggestions.length > 0) {
              setParsedContent(parsed);
              // Show toast with parsing result
              if (parsed.type === 'receipt') {
                toast.success('Receipt detected! Check suggestions below.', {
                  duration: 5000,
                });
              } else if (parsed.type === 'itinerary') {
                toast.success(`Found ${parsed.itinerary?.events.length || 0} calendar events!`, {
                  duration: 5000,
                });
              }
            }
          } catch (parseError) {
            if (import.meta.env.DEV) {
              console.warn('[useShareAsset] Content parsing failed:', parseError);
            }
          }
        }

        toast.success(`${kind === 'image' ? 'Photo' : 'Video'} uploaded successfully`);
        return { type: kind, ref: row };
      } else {
        // Handle document / voice-note upload
        const isVoiceNote =
          Boolean(voiceMeta) ||
          file.type.startsWith('audio/') ||
          /\.(webm|mp3|m4a|ogg|wav|opus)$/i.test(file.name);

        const row = await insertFileIndex({
          tripId,
          name: file.name,
          fileType: file.type || 'application/octet-stream',
          uploadedBy: userId,
        });

        const messageResult = await sendMessageWithCanonicalTransport({
          trip_id: tripId,
          user_id: userId,
          author_name: user?.email?.split('@')[0] || 'Former Member',
          // Voice notes keep caption empty so the bubble is player-first.
          content: isVoiceNote ? '' : file.name,
          privacy_mode: 'standard',
          media_type: isVoiceNote ? 'audio' : 'document',
          media_url: publicUrl,
          attachments: [
            {
              type: isVoiceNote ? 'audio' : 'file',
              ref_id: row.id,
              url: publicUrl,
              mime_type: file.type || 'application/octet-stream',
              ...(voiceMeta
                ? {
                    duration_ms: voiceMeta.durationMs,
                    waveform: voiceMeta.waveform,
                    ...(voiceMeta.transcript ? { transcript: voiceMeta.transcript } : {}),
                  }
                : {}),
            },
          ],
        });

        // 🆕 Auto-parse documents for itineraries (PDFs, etc.)
        if (
          !isVoiceNote &&
          (file.type === 'application/pdf' || file.name.toLowerCase().includes('itinerary'))
        ) {
          try {
            const parsed = await autoParseContent(
              publicUrl,
              'document',
              file.type,
              tripId,
              (messageResult as any)?.id?.toString(),
            );
            if (parsed && parsed.suggestions && parsed.suggestions.length > 0) {
              setParsedContent(parsed);
              toast.success(`Found ${parsed.itinerary?.events.length || 0} calendar events!`, {
                duration: 5000,
              });
            }
          } catch (parseError) {
            if (import.meta.env.DEV) {
              console.warn('[useShareAsset] Document parsing failed:', parseError);
            }
          }
        }

        toast.success(isVoiceNote ? 'Voice note sent' : 'File uploaded successfully');
        return { type: isVoiceNote ? 'audio' : 'file', ref: row };
      }
    } catch (e) {
      clearInterval(progressInterval);
      const errorMsg = e instanceof Error ? e.message : 'Upload failed';
      setError(errorMsg);
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: {
          fileId,
          fileName: file.name,
          progress: 0,
          status: 'error',
        },
      }));
      toast.error(errorMsg);
      throw e;
    } finally {
      // Clean up progress after a delay
      setTimeout(() => {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
      }, 2000);
      setUploading(false);
    }
  }

  async function shareLink(url: string) {
    setUploading(true);
    setError(null);

    try {
      // Validate URL
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }

      // Fetch Open Graph data
      const ogData = await fetchOpenGraphData(url);

      // Insert link index
      const row = await insertLinkIndex({
        tripId,
        url,
        ogTitle: ogData.title,
        ogImage: ogData.image,
        ogDescription: ogData.description,
        domain: ogData.domain,
        submittedBy: userId,
      });

      // Create chat message
      await sendMessageWithCanonicalTransport({
        trip_id: tripId,
        user_id: userId,
        author_name: user?.email?.split('@')[0] || 'Former Member',
        content: url,
        privacy_mode: 'standard',
        link_preview: {
          url,
          title: ogData.title,
          image: ogData.image,
          description: ogData.description,
          domain: ogData.domain,
        },
        attachments: [
          {
            type: 'link',
            ref_id: row.id,
            url,
          },
        ],
      });

      toast.success('Link shared successfully');
      return { type: 'link', ref: row };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Link share failed';
      setError(errorMsg);
      toast.error(errorMsg);
      throw e;
    } finally {
      setUploading(false);
    }
  }

  /**
   * Upload multiple images as a single Stream message so the mosaic renderer
   * receives one attachments[] array (1/2/3/4-up). Videos/docs stay one-per-message.
   */
  async function shareImageBatch(files: File[]) {
    setUploading(true);
    setError(null);
    const uploaded: Array<{ id: string; url: string; filename: string }> = [];

    try {
      for (const file of files) {
        const { publicUrl, key } = await uploadToStorage(file, tripId, 'images');
        const row = await insertMediaIndex({
          tripId,
          mediaType: 'image',
          url: publicUrl,
          uploadPath: key,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: userId,
        });
        uploaded.push({ id: row.id, url: publicUrl, filename: file.name });
      }

      const first = uploaded[0];
      await sendMessageWithCanonicalTransport({
        trip_id: tripId,
        user_id: userId,
        author_name: user?.email?.split('@')[0] || 'Former Member',
        content: '',
        privacy_mode: 'standard',
        media_type: 'image',
        media_url: first.url,
        attachments: uploaded.map(item => ({
          type: 'image',
          ref_id: item.id,
          url: item.url,
        })),
      });

      toast.success(
        uploaded.length === 1
          ? 'Photo uploaded successfully'
          : `${uploaded.length} photos uploaded`,
      );
      return uploaded.map(item => ({ type: 'image' as const, ref: { id: item.id } }));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Upload failed';
      setError(errorMsg);
      toast.error(errorMsg);
      throw e;
    } finally {
      setUploading(false);
    }
  }

  async function shareVoiceNote(file: File, meta: VoiceNoteShareMeta) {
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setUploading(true);
    setError(null);
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: {
        fileId,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
      },
    }));

    try {
      const { publicUrl, key } = await uploadVoiceNoteToStorage(file, tripId);
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: {
          fileId,
          fileName: file.name,
          progress: 100,
          status: 'completed',
        },
      }));

      const row = await insertFileIndex({
        tripId,
        name: file.name,
        fileType: file.type || 'audio/webm',
        uploadedBy: userId,
      });

      await sendMessageWithCanonicalTransport({
        trip_id: tripId,
        user_id: userId,
        author_name: user?.email?.split('@')[0] || 'Former Member',
        content: meta.transcript ? 'Voice note' : '',
        privacy_mode: 'standard',
        media_type: 'audio',
        media_url: publicUrl,
        attachments: [
          {
            type: 'audio',
            ref_id: row.id,
            url: publicUrl,
            mime_type: file.type || 'audio/webm',
            duration_ms: meta.durationMs,
            waveform: meta.waveform,
            ...(meta.transcript ? { transcript: meta.transcript } : {}),
            upload_path: key,
          },
        ],
      });

      toast.success('Voice note sent');
      return { type: 'audio' as const, ref: row };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Upload failed';
      setError(errorMsg);
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: {
          fileId,
          fileName: file.name,
          progress: 0,
          status: 'error',
        },
      }));
      toast.error(errorMsg);
      throw e;
    } finally {
      setTimeout(() => {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
      }, 2000);
      setUploading(false);
    }
  }

  async function shareMultipleFiles(files: FileList, type: 'image' | 'video' | 'document') {
    const fileArray = Array.from(files);

    // Multi-image selections become one mosaic message (Phase 3 contract).
    if (type === 'image' && fileArray.length > 1) {
      try {
        return await shareImageBatch(fileArray);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to upload image batch:', error);
        }
        return [];
      }
    }

    const results = [];

    for (const file of fileArray) {
      try {
        const kind: ShareKind = type === 'document' ? 'file' : type;
        const result = await shareFile(kind, file);
        results.push(result);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(`Failed to upload ${file.name}:`, error);
        }
      }
    }

    return results;
  }

  return {
    shareFile,
    shareLink,
    shareMultipleFiles,
    shareVoiceNote,
    isUploading,
    uploadProgress,
    error,
    parsedContent, // 🆕 Return parsed content for UI to display suggestions
    clearParsedContent: () => setParsedContent(null), // 🆕 Clear parsed content
  };
}
