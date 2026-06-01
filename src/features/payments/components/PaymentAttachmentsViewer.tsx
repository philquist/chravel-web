/**
 * PaymentAttachmentsViewer
 *
 * Compact, read-only attachment affordance shown on a payment card ONLY when attachments exist.
 * A small chip ("{n} attachments") expands an inline list. Tapping:
 *   - image → opens the shared MediaViewerModal lightbox
 *   - file  → opens a freshly signed storage URL in a new tab
 *   - link  → opens the URL in a new tab (noopener)
 */

import React, { useMemo, useState } from 'react';
import { Paperclip, FileText, Link2, ChevronDown, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MediaViewerModal, type MediaViewerItem } from '@/components/media/MediaViewerModal';
import { resolveTripMediaUrl } from '@/services/tripMediaUrlResolver';
import { useResolvedTripMediaUrl } from '@/hooks/useResolvedTripMediaUrl';
import type { PaymentAttachment } from '@/services/paymentAttachmentService';

interface PaymentAttachmentsViewerProps {
  attachments: PaymentAttachment[];
}

/** Small image thumbnail that resolves a signed URL for trip-media assets. */
const AttachmentThumb: React.FC<{ attachment: PaymentAttachment }> = ({ attachment }) => {
  const resolved = useResolvedTripMediaUrl({
    url: attachment.url,
    metadata: attachment.storagePath
      ? { upload_path: attachment.storagePath }
      : attachment.metadata,
  });
  if (!resolved) return <FileText size={16} className="text-muted-foreground" />;
  return <img src={resolved} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />;
};

export const PaymentAttachmentsViewer: React.FC<PaymentAttachmentsViewerProps> = ({
  attachments,
}) => {
  const [open, setOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Only image attachments are navigable in the lightbox.
  const imageItems = useMemo<MediaViewerItem[]>(
    () =>
      attachments
        .filter(a => a.attachmentType === 'image' && a.url)
        .map(a => ({
          id: a.id,
          url: a.url as string,
          mimeType: a.mimeType || 'image/jpeg',
          fileName: a.fileName,
          metadata: a.storagePath ? { upload_path: a.storagePath } : a.metadata,
        })),
    [attachments],
  );

  if (attachments.length === 0) return null;

  const label = attachments.length === 1 ? 'View attachment' : `${attachments.length} attachments`;

  const openImage = (attachmentId: string) => {
    const idx = imageItems.findIndex(i => i.id === attachmentId);
    if (idx >= 0) setViewerIndex(idx);
  };

  const openExternal = async (attachment: PaymentAttachment) => {
    if (attachment.attachmentType === 'link') {
      window.open(attachment.url ?? '', '_blank', 'noopener,noreferrer');
      return;
    }
    // file → resolve a signed URL (trip-media is member-gated) before opening.
    let href = attachment.url ?? '';
    if (attachment.url) {
      try {
        href = await resolveTripMediaUrl({
          mediaUrl: attachment.url,
          metadata: attachment.storagePath
            ? { upload_path: attachment.storagePath }
            : attachment.metadata,
        });
      } catch {
        // fall back to stored url
      }
    }
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            aria-label={`${label} for this payment`}
          >
            <Paperclip size={14} />
            {label}
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {attachments.map(attachment => {
            const isImage = attachment.attachmentType === 'image';
            const display =
              attachment.title ||
              attachment.fileName ||
              (attachment.attachmentType === 'link'
                ? (attachment.metadata?.domain as string) || attachment.url
                : 'Attachment');
            return (
              <button
                key={attachment.id}
                type="button"
                onClick={() => (isImage ? openImage(attachment.id) : openExternal(attachment))}
                className="flex w-full items-center gap-2 rounded-lg bg-background/50 px-2 py-2 text-left hover:bg-muted/60 transition-colors min-h-[44px]"
              >
                {isImage ? (
                  <AttachmentThumb attachment={attachment} />
                ) : attachment.attachmentType === 'link' ? (
                  <Link2 size={18} className="text-muted-foreground shrink-0" />
                ) : (
                  <FileText size={18} className="text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 truncate text-sm text-foreground">{display}</span>
                {!isImage && <ExternalLink size={14} className="text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {viewerIndex !== null && imageItems.length > 0 && (
        <MediaViewerModal
          items={imageItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};
