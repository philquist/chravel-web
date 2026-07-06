import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getUploadContentType } from '@/utils/mime';
import type { AgendaFile } from '@/types/events';
import { withTimeout } from '@/utils/timeout';

const MAX_LINEUP_FILES = 5;
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const VALID_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

function getPrefix(eventId: string): string {
  return `${eventId}/lineup-files`;
}

function getUploadPrefix(eventId: string, userId: string): string {
  // Storage RLS requires `${eventId}/${auth.uid()}/...` on INSERT.
  return `${eventId}/${userId}/lineup-files`;
}

function parseOriginalName(storedName: string): string {
  const idx = storedName.indexOf('--');
  if (idx === -1) return storedName;
  try {
    return decodeURIComponent(storedName.slice(idx + 2));
  } catch {
    return storedName.slice(idx + 2);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UseEventLineupFilesOptions {
  eventId: string;
  enabled?: boolean;
}

/**
 * Upload PDFs or images of the lineup for storage/viewing only.
 * No AI parsing—attendees view the uploaded files directly.
 */
export function useEventLineupFiles({ eventId, enabled = true }: UseEventLineupFilesOptions) {
  const [files, setFiles] = useState<AgendaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!eventId || !enabled) return;
    setIsLoading(true);
    setLoadError(null);

    // New upload paths are `${eventId}/${userId}/lineup-files/*` to satisfy
    // storage RLS. Legacy `${eventId}/lineup-files/*` is still listed for
    // backwards compatibility.
    const legacyPrefix = getPrefix(eventId);
    type ListedFile = { name: string; path: string; row: any };
    const listed: ListedFile[] = [];

    const safeList = async (path: string) => {
      try {
        const res = await withTimeout(
          supabase.storage
            .from('trip-media')
            .list(path, { sortBy: { column: 'created_at', order: 'asc' } }),
          5000,
          'Lineup files request timed out',
        );
        return res.data ?? [];
      } catch {
        return [];
      }
    };

    const eventRoot = await safeList(eventId);
    const userFolders = eventRoot.filter(
      f => f.name !== '.emptyFolderPlaceholder' && f.name !== 'lineup-files' && f.id === null,
    );
    for (const uf of userFolders) {
      const userPrefix = getUploadPrefix(eventId, uf.name);
      const rows = await safeList(userPrefix);
      for (const r of rows) {
        if (r.name === '.emptyFolderPlaceholder') continue;
        listed.push({ name: r.name, path: `${userPrefix}/${r.name}`, row: r });
      }
    }
    const legacyRows = await safeList(legacyPrefix);
    for (const r of legacyRows) {
      if (r.name === '.emptyFolderPlaceholder') continue;
      listed.push({ name: r.name, path: `${legacyPrefix}/${r.name}`, row: r });
    }

    const mapped: AgendaFile[] = await Promise.all(
      listed.map(async ({ name, path, row }) => {
        const { data: urlData } = supabase.storage.from('trip-media').getPublicUrl(path);
        const { data: signedData, error: signedError } = await supabase.storage
          .from('trip-media')
          .createSignedUrl(path, 60 * 30);
        const resolvedUrl =
          !signedError && signedData?.signedUrl ? signedData.signedUrl : urlData.publicUrl;
        return {
          id: row.id ?? path,
          name: parseOriginalName(name),
          storagePath: path,
          publicUrl: resolvedUrl,
          mimeType:
            ((row.metadata as Record<string, unknown>)?.mimetype as string) ??
            'application/octet-stream',
          size: ((row.metadata as Record<string, unknown>)?.size as number) ?? 0,
          createdAt: row.created_at ?? '',
        };
      }),
    );

    setFiles(mapped);
    setIsLoading(false);
  }, [eventId, enabled]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const uploadFiles = useCallback(
    async (newFiles: File[]): Promise<boolean> => {
      setUploadError(null);

      if (files.length + newFiles.length > MAX_LINEUP_FILES) {
        setUploadError(
          `Maximum ${MAX_LINEUP_FILES} files allowed. You already have ${files.length} file(s).`,
        );
        return false;
      }

      for (const file of newFiles) {
        const type = getUploadContentType(file);
        if (!VALID_MIME_TYPES.includes(type)) {
          setUploadError(
            `"${file.name}" is not supported. Only images (JPG, PNG, WebP) and PDFs are allowed.`,
          );
          return false;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setUploadError(
            `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum file size is ${MAX_FILE_SIZE_MB}MB.`,
          );
          return false;
        }
      }

      setIsUploading(true);
      const { data: authData } = await supabase.auth.getUser();
      const uploaderId = authData?.user?.id;
      if (!uploaderId) {
        setUploadError('You must be signed in to upload files.');
        setIsUploading(false);
        return false;
      }
      const prefix = getUploadPrefix(eventId, uploaderId);
      let hadError = false;

      for (const file of newFiles) {
        const contentType = getUploadContentType(file);
        const sanitizedName = encodeURIComponent(file.name);
        const key = `${prefix}/${crypto.randomUUID()}--${sanitizedName}`;

        const { error } = await supabase.storage
          .from('trip-media')
          .upload(key, file, { contentType, upsert: false });

        if (error) {
          setUploadError(`Failed to upload "${file.name}": ${error.message}`);
          hadError = true;
          break;
        }
      }

      await loadFiles();
      setIsUploading(false);
      return !hadError;
    },
    [eventId, files.length, loadFiles],
  );

  const deleteFile = useCallback(async (storagePath: string) => {
    const { error } = await supabase.storage.from('trip-media').remove([storagePath]);

    if (error) {
      setUploadError(`Failed to delete file: ${error.message}`);
      return;
    }

    setFiles(prev => prev.filter(f => f.storagePath !== storagePath));
  }, []);

  const clearError = useCallback(() => setUploadError(null), []);
  const setError = useCallback((msg: string | null) => setUploadError(msg), []);

  const remainingSlots = MAX_LINEUP_FILES - files.length;
  const canUpload = remainingSlots > 0;
  const canUploadMore = canUpload;

  return {
    files,
    isLoading,
    isUploading,
    uploadError,
    loadError,
    clearError,
    setError,
    uploadFiles,
    deleteFile,
    maxFiles: MAX_LINEUP_FILES,
    remainingSlots,
    canUpload,
    canUploadMore,
    formatFileSize,
  };
}
