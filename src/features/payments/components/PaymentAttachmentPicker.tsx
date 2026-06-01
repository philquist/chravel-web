/**
 * PaymentAttachmentPicker
 *
 * Optional "Attachments" section for the payment-creation form. Lets a user stage receipt
 * images, PDFs/docs, and URLs before submitting. Purely presentational — staging state and
 * validation live in `usePaymentAttachmentDraft`. Mobile-safe (44px targets); does not affect
 * the primary submit CTA.
 */

import React, { useRef, useState } from 'react';
import { Paperclip, Link2, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PendingAttachment } from '../hooks/usePaymentAttachmentDraft';

const FILE_ACCEPT = 'image/*,application/pdf,text/plain,.pdf,.txt';

interface PaymentAttachmentPickerProps {
  pending: PendingAttachment[];
  onAddFiles: (files: FileList | File[]) => void;
  onAddUrl: (url: string) => boolean;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export const PaymentAttachmentPicker: React.FC<PaymentAttachmentPickerProps> = ({
  pending,
  onAddFiles,
  onAddUrl,
  onRemove,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState('');

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    // Reset so picking the same file again re-fires onChange.
    e.target.value = '';
  };

  const handleAddUrl = () => {
    if (!urlValue.trim()) return;
    if (onAddUrl(urlValue)) {
      setUrlValue('');
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-muted-foreground">
          Attachments <span className="text-xs font-normal opacity-70">(optional)</span>
        </label>
        <p className="text-xs text-muted-foreground/80 mt-0.5">
          Add a receipt, confirmation, screenshot, PDF, or link.
        </p>
      </div>

      {/* Add controls */}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="justify-center gap-2 min-h-[44px] bg-glass-slate-bg border-glass-slate-border text-foreground hover:bg-muted/60"
        >
          <Paperclip size={16} />
          Add file or photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFilePick}
          aria-label="Attach a file or photo to this payment"
        />

        <div className="flex items-center gap-2">
          <Input
            type="url"
            inputMode="url"
            value={urlValue}
            disabled={disabled}
            onChange={e => setUrlValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
            placeholder="Paste a link (e.g. booking or order URL)"
            className="flex-1 min-h-[44px] bg-glass-slate-bg border-glass-slate-border text-foreground"
            aria-label="Attach a URL to this payment"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !urlValue.trim()}
            onClick={handleAddUrl}
            className="min-h-[44px] gap-2 bg-glass-slate-bg border-glass-slate-border text-foreground hover:bg-muted/60"
          >
            <Link2 size={16} />
            Add
          </Button>
        </div>
      </div>

      {/* Staged items */}
      {pending.length > 0 && (
        <ul className="space-y-2" aria-label="Staged attachments">
          {pending.map(item => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-glass-slate-border bg-glass-slate-bg/50 px-2 py-2"
            >
              {item.kind === 'file' && item.type === 'image' && item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : item.kind === 'file' ? (
                <FileText size={18} className="text-muted-foreground shrink-0" />
              ) : item.kind === 'url' ? (
                <Link2 size={18} className="text-muted-foreground shrink-0" />
              ) : (
                <ImageIcon size={18} className="text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate text-sm text-foreground">
                {item.kind === 'file' ? item.file.name : item.url}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label="Remove attachment"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground shrink-0"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
