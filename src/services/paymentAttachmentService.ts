/**
 * Payment Attachment Service
 *
 * Optional proof/context attached to a payment request (receipt image, PDF/doc, screenshot,
 * order confirmation, or a URL). Each attachment is uploaded/stored ONCE and surfaced twice:
 *   (a) indexed into the canonical Media tables (`trip_media_index` for image/document,
 *       `trip_link_index` for URLs) so it appears in the Media tab automatically, and
 *   (b) a `payment_attachments` row, the source of truth the payment card reads.
 *
 * Attachments are created AFTER the payment exists (we need its id). Each item is independent —
 * one failing item never rolls back the payment or the other items (the caller surfaces a clear
 * per-item error). Images reuse the shared upload pipeline (compression + quota); documents reuse
 * the same storage path/bucket. URLs reuse the existing link index + (best-effort) OG metadata.
 */

import { supabase } from '@/integrations/supabase/client';
import { uploadToStorage, insertMediaIndex } from './uploadService';
import { insertLinkIndex, fetchOpenGraphData } from './linkService';
import { normalizeUrl, getDomain } from './urlUtils';
import { SUPPORTED_IMAGE_MIME } from '@/utils/imagePrep';
import { getUploadContentType } from '@/utils/mime';

export const MAX_PAYMENT_ATTACHMENTS = 5;
export const MAX_PAYMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

/** Document MIME types accepted as payment proof (in addition to images). */
const SUPPORTED_DOC_MIME = new Set<string>(['application/pdf', 'text/plain']);
const SUPPORTED_DOC_EXT = /\.(pdf|txt)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;
const HEIC_MIME = /^image\/hei[cf]/i;

export type PaymentAttachmentType = 'image' | 'file' | 'link';

export interface PaymentAttachment {
  id: string;
  paymentMessageId: string;
  tripId: string;
  attachmentType: PaymentAttachmentType;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  url: string | null;
  title: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PaymentContext {
  description?: string;
  amount?: number;
  currency?: string;
}

export class PaymentAttachmentError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'PaymentAttachmentError';
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Categorize a File into the attachment type we store, or throw a user-facing error. */
export function classifyAttachmentFile(file: File): { type: 'image' | 'file'; mimeType: string } {
  const mimeType = getUploadContentType(file);
  const name = file.name || '';

  if (HEIC_MIME.test(mimeType) || HEIC_EXT.test(name)) {
    throw new PaymentAttachmentError(
      "HEIC photos from iPhone can't be uploaded directly. In your iPhone Camera settings choose " +
        '"Most Compatible", or take a screenshot of the receipt and attach that instead.',
    );
  }

  if (SUPPORTED_IMAGE_MIME.has(mimeType.toLowerCase()) || mimeType.startsWith('image/')) {
    return { type: 'image', mimeType };
  }

  if (SUPPORTED_DOC_MIME.has(mimeType.toLowerCase()) || SUPPORTED_DOC_EXT.test(name)) {
    return { type: 'file', mimeType: mimeType || 'application/octet-stream' };
  }

  throw new PaymentAttachmentError(
    `Unsupported file type${file.name ? ` (${file.name})` : ''}. Attach an image (JPG, PNG, WebP) or a PDF.`,
  );
}

/** Validate file size; throws a user-facing error if too large. */
export function validatePaymentFileSize(file: File): void {
  if (file.size > MAX_PAYMENT_ATTACHMENT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new PaymentAttachmentError(`That file is ${mb}MB. Attachments must be 10MB or smaller.`);
  }
}

/**
 * Coerce a user-entered URL to a normalized https(s) URL, or throw a user-facing error.
 * (Server-side OG fetch already guards against SSRF; here we only validate shape.)
 */
export function normalizePaymentUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new PaymentAttachmentError('Enter a URL to attach.');
  }

  let withProtocol: string;
  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed;
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    // Explicit non-http(s) scheme (e.g. ftp://) — reject.
    throw new PaymentAttachmentError('Only http(s) links can be attached.');
  } else if (/^(javascript|data|file|mailto|vbscript|tel|blob):/i.test(trimmed)) {
    // Dangerous / non-web schemes without "//" — reject before we ever coerce to https.
    throw new PaymentAttachmentError('Only http(s) links can be attached.');
  } else {
    withProtocol = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new PaymentAttachmentError("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PaymentAttachmentError('Only http(s) links can be attached.');
  }
  if (!parsed.hostname.includes('.')) {
    throw new PaymentAttachmentError("That doesn't look like a valid URL.");
  }
  return normalizeUrl(withProtocol);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): PaymentAttachment {
  return {
    id: row.id as string,
    paymentMessageId: row.payment_message_id as string,
    tripId: row.trip_id as string,
    attachmentType: row.attachment_type as PaymentAttachmentType,
    fileName: (row.file_name as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    fileSize: (row.file_size as number | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function buildSourceMetadata(paymentId: string, context: PaymentContext): Record<string, unknown> {
  return {
    source: 'payment',
    payment_id: paymentId,
    ...(context.description ? { payment_description: context.description } : {}),
    ...(typeof context.amount === 'number' ? { payment_amount: context.amount } : {}),
    ...(context.currency ? { payment_currency: context.currency } : {}),
  };
}

/**
 * Upload a file attachment: store the bytes once, index into the Media tab, and create the
 * payment_attachments row. Validation should already have run in the picker, but we re-validate
 * defensively here.
 */
export async function uploadPaymentFileAttachment(params: {
  tripId: string;
  paymentId: string;
  file: File;
  uploadedBy: string;
  context?: PaymentContext;
}): Promise<PaymentAttachment> {
  const { tripId, paymentId, file, uploadedBy, context = {} } = params;

  validatePaymentFileSize(file);
  const { type, mimeType } = classifyAttachmentFile(file);
  const subdir = type === 'image' ? 'images' : 'files';

  // 1. Store the asset once (compression + quota enforcement live in uploadToStorage).
  const { key, publicUrl } = await uploadToStorage(file, tripId, subdir);

  // 2. Index into the canonical media table so it appears in the Media tab.
  await insertMediaIndex({
    tripId,
    mediaType: type === 'image' ? 'image' : 'document',
    url: publicUrl,
    uploadPath: key,
    filename: file.name,
    fileSize: file.size,
    mimeType,
    uploadedBy,
    extraMetadata: buildSourceMetadata(paymentId, context),
  });

  // 3. Record the join row the payment card reads.
  const { data, error } = await supabase
    .from('payment_attachments')
    .insert({
      trip_id: tripId,
      payment_message_id: paymentId,
      uploaded_by: uploadedBy,
      attachment_type: type,
      file_name: file.name,
      mime_type: mimeType,
      file_size: file.size,
      storage_path: key,
      url: publicUrl,
      title: file.name,
      metadata: buildSourceMetadata(paymentId, context),
    })
    .select()
    .single();

  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Attach a URL: index into the link table (best-effort OG metadata) and create the
 * payment_attachments row. OG fetch is non-blocking — a failed preview never blocks the attach.
 */
export async function addPaymentUrlAttachment(params: {
  tripId: string;
  paymentId: string;
  rawUrl: string;
  uploadedBy: string;
  context?: PaymentContext;
}): Promise<PaymentAttachment> {
  const { tripId, paymentId, rawUrl, uploadedBy, context = {} } = params;
  const url = normalizePaymentUrl(rawUrl);

  // Best-effort OG metadata; never block the attach on it (SSRF-safe edge function).
  let title: string | null = null;
  let ogImage: string | null = null;
  let ogDescription: string | null = null;
  let domain = getDomain(url) || null;
  try {
    const og = await fetchOpenGraphData(url);
    title = og.title ?? null;
    ogImage = og.image ?? null;
    ogDescription = og.description ?? null;
    domain = og.domain ?? domain;
  } catch {
    // Ignore — store the bare URL.
  }

  // Index into the link table so it shows under Media › Links.
  try {
    await insertLinkIndex({
      tripId,
      url,
      ogTitle: title,
      ogImage,
      ogDescription: ogDescription ?? 'Saved from payment request',
      domain,
      submittedBy: uploadedBy,
    });
  } catch {
    // A duplicate/link-index failure must not block the payment attachment record.
  }

  const { data, error } = await supabase
    .from('payment_attachments')
    .insert({
      trip_id: tripId,
      payment_message_id: paymentId,
      uploaded_by: uploadedBy,
      attachment_type: 'link',
      url,
      title: title || domain || url,
      metadata: { ...buildSourceMetadata(paymentId, context), domain, og_image_url: ogImage },
    })
    .select()
    .single();

  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Fetch attachments for a set of payment messages, grouped by payment id. */
export async function fetchPaymentAttachments(
  paymentMessageIds: string[],
): Promise<Map<string, PaymentAttachment[]>> {
  const grouped = new Map<string, PaymentAttachment[]>();
  const ids = paymentMessageIds.filter(Boolean);
  if (ids.length === 0) return grouped;

  const { data, error } = await supabase
    .from('payment_attachments')
    .select(
      'id, payment_message_id, trip_id, attachment_type, file_name, mime_type, file_size, storage_path, url, title, metadata, created_at',
    )
    .in('payment_message_id', ids)
    .order('created_at', { ascending: true });

  if (error) throw error;

  for (const raw of data ?? []) {
    const attachment = mapRow(raw as Record<string, unknown>);
    const list = grouped.get(attachment.paymentMessageId) ?? [];
    list.push(attachment);
    grouped.set(attachment.paymentMessageId, list);
  }
  return grouped;
}
