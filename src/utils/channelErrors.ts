/**
 * Channel-specific error mapping utilities.
 *
 * Maps raw Supabase / network errors into user-friendly toast messages.
 * In development builds, extra technical detail is appended for debugging.
 */

import { classifyError } from './errorClassification';

const isDev = import.meta.env.DEV;

/** Structured error returned from channel operations */
export interface ChannelOperationError {
  /** User-facing title for the toast */
  title: string;
  /** User-facing description */
  description: string;
  /** The raw Supabase/network error for logging */
  raw?: unknown;
}

/**
 * Categorise a Supabase error (or generic JS error) and return a
 * user-friendly message suitable for a toast notification.
 */
export function mapChannelSendError(error: unknown): ChannelOperationError {
  // Bucketing lives in the shared classifier; this function only maps a category → toast copy.
  switch (classifyError(error)) {
    case 'permission-denied':
      return {
        title: 'Cannot send message',
        description: "You don't have access to post in this channel yet.",
        raw: error,
      };

    case 'foreign-key':
      return {
        title: 'Channel unavailable',
        description: 'This channel no longer exists or has been archived.',
        raw: error,
      };

    case 'validation':
      return {
        title: 'Invalid message',
        description: 'The message could not be sent — some required data was missing.',
        raw: error,
      };

    case 'network':
      return {
        title: 'Connection issue',
        description: "Couldn't reach the server. Check your connection and try again.",
        raw: error,
      };

    case 'rate-limit':
      return {
        title: 'Slow down',
        description: "You're sending messages too quickly. Wait a moment and try again.",
        raw: error,
      };

    // not-found / auth-required / malformed / unknown all surface the generic send failure.
    default:
      return {
        title: 'Message failed to send',
        description: 'Something went wrong. Please try again.',
        raw: error,
      };
  }
}

/**
 * Format the description for a toast.
 * In DEV mode, appends the raw code+message for debugging.
 */
export function formatToastDescription(mapped: ChannelOperationError): string {
  if (!isDev || !mapped.raw) return mapped.description;

  const code = (mapped.raw as { code?: string })?.code ?? '';
  const message = (mapped.raw as { message?: string })?.message ?? '';
  const devSuffix = code || message ? ` (code: ${code || '?'}, msg: ${message || '?'})` : '';
  return `${mapped.description}${devSuffix}`;
}

/**
 * Validates message content before sending.
 * Returns a ChannelOperationError if invalid, or null if OK.
 */
export function validateMessageContent(content: string): ChannelOperationError | null {
  const trimmed = content.trim();

  if (!trimmed) {
    return {
      title: 'Empty message',
      description: "Message can't be empty.",
    };
  }

  if (trimmed.length > 5000) {
    return {
      title: 'Message too long',
      description: 'Please keep your message under 5000 characters.',
    };
  }

  return null;
}
