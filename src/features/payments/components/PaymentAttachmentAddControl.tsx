/**
 * Post-create receipt/attachment uploader for an existing payment request.
 * Lets the payment creator (or any trip member with attach permission) add
 * photos, PDFs, or links after the expense already exists — e.g. "here's the
 * Dodgers tickets PDF."
 */

import React, { useRef, useState } from 'react';
import { Loader2, Paperclip, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/queryKeys';
import {
  MAX_PAYMENT_ATTACHMENTS,
  PaymentAttachmentError,
  addPaymentUrlAttachment,
  classifyAttachmentFile,
  uploadPaymentFileAttachment,
  validatePaymentFileSize,
  type PaymentAttachment,
  type PaymentContext,
} from '@/services/paymentAttachmentService';

const FILE_ACCEPT = 'image/*,application/pdf,text/plain,.pdf,.txt';

interface PaymentAttachmentAddControlProps {
  tripId: string;
  paymentId: string;
  uploadedBy: string;
  existingCount: number;
  context?: PaymentContext;
  onAttached?: (attachment: PaymentAttachment) => void;
  disabled?: boolean;
}

export const PaymentAttachmentAddControl: React.FC<PaymentAttachmentAddControlProps> = ({
  tripId,
  paymentId,
  uploadedBy,
  existingCount,
  context,
  onAttached,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const remaining = MAX_PAYMENT_ATTACHMENTS - existingCount;
  const atLimit = remaining <= 0;

  const refreshCaches = () => {
    queryClient.invalidateQueries({ queryKey: tripKeys.paymentAttachments(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.media(tripId) });
    queryClient.invalidateQueries({ queryKey: ['tripLinks', tripId] });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || atLimit || uploading) return;
    setUploading(true);
    try {
      const toUpload = Array.from(files).slice(0, remaining);
      for (const file of toUpload) {
        try {
          validatePaymentFileSize(file);
          classifyAttachmentFile(file);
          const attachment = await uploadPaymentFileAttachment({
            tripId,
            paymentId,
            file,
            uploadedBy,
            context,
          });
          onAttached?.(attachment);
        } catch (err) {
          toast({
            title: 'Attachment not added',
            description:
              err instanceof PaymentAttachmentError
                ? err.userMessage
                : 'Could not upload that file.',
            variant: 'destructive',
          });
        }
      }
      refreshCaches();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = async () => {
    if (!urlValue.trim() || atLimit || uploading) return;
    setUploading(true);
    try {
      const attachment = await addPaymentUrlAttachment({
        tripId,
        paymentId,
        rawUrl: urlValue,
        uploadedBy,
        context,
      });
      onAttached?.(attachment);
      setUrlValue('');
      setShowUrl(false);
      refreshCaches();
      toast({ title: 'Link attached', description: 'Receipt link added to this payment.' });
    } catch (err) {
      toast({
        title: 'Attachment not added',
        description:
          err instanceof PaymentAttachmentError ? err.userMessage : 'Could not add that link.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  if (atLimit) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        Max {MAX_PAYMENT_ATTACHMENTS} attachments on this payment.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || uploading}
          className="text-xs min-h-[44px]"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add receipt photo or PDF"
        >
          {uploading ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <Paperclip size={14} className="mr-1" />
          )}
          Add receipt
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || uploading}
          className="text-xs min-h-[44px]"
          onClick={() => setShowUrl(prev => !prev)}
          aria-label="Add receipt link"
        >
          <Plus size={14} className="mr-1" />
          Add link
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={e => void handleFiles(e.target.files)}
        />
      </div>
      {showUrl && (
        <div className="flex gap-2">
          <Input
            value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            placeholder="https://…"
            className="min-h-[44px]"
            aria-label="Receipt or confirmation URL"
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] shrink-0"
            disabled={uploading || !urlValue.trim()}
            onClick={() => void handleAddUrl()}
          >
            Attach
          </Button>
        </div>
      )}
    </div>
  );
};
