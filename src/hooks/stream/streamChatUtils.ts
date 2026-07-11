import type { MessageResponse } from 'stream-chat';

/**
 * A Stream message that has been soft-deleted. Stream still returns these on
 * channel.query()/watch() (with `deleted_at` set and text cleared), so every read path
 * must drop them or a deleted message reappears as an empty bubble after reload/reconnect.
 */
export function isDeletedStreamMessage(message: MessageResponse): boolean {
  return (
    Boolean((message as { deleted_at?: string | null }).deleted_at) ||
    (message as { type?: string }).type === 'deleted'
  );
}

/**
 * Reject if `promise` doesn't settle within `ms`. A `channel.watch()` over a wedged
 * WebSocket can hang without resolving OR throwing — without this bound, the chat loading
 * skeleton spins forever. On timeout we reject so the caller can surface a Retry state.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
