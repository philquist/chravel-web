/**
 * usePaymentAttachmentDraft
 *
 * Holds the OPTIONAL attachments a user is staging in the payment-creation form before submit,
 * and commits them after the payment is created (we need the payment id first).
 *
 * Files and URLs are validated at add-time so the user gets immediate feedback (toast) and we
 * never stage an unsupported/oversized item. Commit runs each item independently: one failure
 * never blocks the payment or the other items — the caller is told which items failed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { tripKeys } from '@/lib/queryKeys';
import {
  MAX_PAYMENT_ATTACHMENTS,
  PaymentAttachmentError,
  addPaymentUrlAttachment,
  classifyAttachmentFile,
  normalizePaymentUrl,
  uploadPaymentFileAttachment,
  validatePaymentFileSize,
  type PaymentContext,
} from '@/services/paymentAttachmentService';

export type PendingAttachment =
  | { id: string; kind: 'file'; file: File; type: 'image' | 'file'; previewUrl?: string }
  | { id: string; kind: 'url'; url: string };

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export const usePaymentAttachmentDraft = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // Track object URLs so we can revoke them and avoid leaks.
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    };
  }, []);

  const showError = useCallback(
    (message: string) => {
      toast({ title: 'Attachment not added', description: message, variant: 'destructive' });
    },
    [toast],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      setPending(prev => {
        let next = prev;
        for (const file of incoming) {
          if (next.length >= MAX_PAYMENT_ATTACHMENTS) {
            showError(`You can attach up to ${MAX_PAYMENT_ATTACHMENTS} items per payment.`);
            break;
          }
          try {
            validatePaymentFileSize(file);
            const { type } = classifyAttachmentFile(file);
            let previewUrl: string | undefined;
            if (type === 'image') {
              previewUrl = URL.createObjectURL(file);
              objectUrls.current.add(previewUrl);
            }
            next = [...next, { id: newId(), kind: 'file', file, type, previewUrl }];
          } catch (err) {
            showError(
              err instanceof PaymentAttachmentError ? err.userMessage : 'Could not add that file.',
            );
          }
        }
        return next;
      });
    },
    [showError],
  );

  const addUrl = useCallback(
    (rawUrl: string): boolean => {
      let normalized: string;
      try {
        normalized = normalizePaymentUrl(rawUrl);
      } catch (err) {
        showError(
          err instanceof PaymentAttachmentError ? err.userMessage : 'Could not add that link.',
        );
        return false;
      }
      let added = false;
      setPending(prev => {
        if (prev.length >= MAX_PAYMENT_ATTACHMENTS) {
          showError(`You can attach up to ${MAX_PAYMENT_ATTACHMENTS} items per payment.`);
          return prev;
        }
        if (prev.some(p => p.kind === 'url' && p.url === normalized)) {
          return prev; // de-dupe silently
        }
        added = true;
        return [...prev, { id: newId(), kind: 'url', url: normalized }];
      });
      return added;
    },
    [showError],
  );

  const remove = useCallback((id: string) => {
    setPending(prev => {
      const target = prev.find(p => p.id === id);
      if (target?.kind === 'file' && target.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrls.current.delete(target.previewUrl);
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setPending([]);
  }, []);

  /**
   * Commit staged attachments to a freshly-created payment, then refresh the affected caches and
   * clear the draft. Returns the number of failures; surfaces a single summary toast naming what
   * failed so the (already-created) payment is never silently left without its proof.
   *
   * Uploads run sequentially on purpose: parallel uploads would race the per-trip media quota
   * check inside `uploadToStorage`.
   */
  const commit = useCallback(
    async (params: {
      tripId: string;
      paymentId: string;
      uploadedBy: string;
      context?: PaymentContext;
    }): Promise<{ succeeded: number; failed: number }> => {
      const items = pending;
      if (items.length === 0) return { succeeded: 0, failed: 0 };

      let succeeded = 0;
      const failures: string[] = [];

      for (const item of items) {
        try {
          if (item.kind === 'file') {
            await uploadPaymentFileAttachment({
              tripId: params.tripId,
              paymentId: params.paymentId,
              file: item.file,
              uploadedBy: params.uploadedBy,
              context: params.context,
            });
          } else {
            await addPaymentUrlAttachment({
              tripId: params.tripId,
              paymentId: params.paymentId,
              rawUrl: item.url,
              uploadedBy: params.uploadedBy,
              context: params.context,
            });
          }
          succeeded += 1;
        } catch (err) {
          const label = item.kind === 'file' ? item.file.name : item.url;
          failures.push(label);
          if (import.meta.env.DEV) console.error('[payment-attachment] commit failed:', label, err);
        }
      }

      if (failures.length > 0) {
        toast({
          title: 'Some attachments did not upload',
          description: `The payment was created, but these could not be attached: ${failures.join(', ')}. You can re-upload them in Media.`,
          variant: 'destructive',
        });
      }

      // Refresh the surfaces these attachments appear on (payment cards + Media tab),
      // then clear the staged draft. Realtime also covers this; invalidation makes it instant.
      if (succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: tripKeys.paymentAttachments(params.tripId) });
        queryClient.invalidateQueries({ queryKey: tripKeys.media(params.tripId) });
        queryClient.invalidateQueries({ queryKey: ['tripLinks', params.tripId] });
      }
      reset();

      return { succeeded, failed: failures.length };
    },
    [pending, toast, queryClient, reset],
  );

  return { pending, addFiles, addUrl, remove, reset, commit, count: pending.length };
};
