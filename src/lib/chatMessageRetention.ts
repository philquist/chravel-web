import { LARGE_LIST_THRESHOLDS } from './largeListThresholds';

/** Keep the newest messages when client state exceeds the retention cap. */
export function capRetainedMessages<T>(
  messages: T[],
  maxCount: number = LARGE_LIST_THRESHOLDS.maxRetainedChatMessages,
): T[] {
  if (messages.length <= maxCount) return messages;
  return messages.slice(messages.length - maxCount);
}

/** When prepending older history, keep the oldest messages and drop newest overflow. */
export function capPrependedMessages<T>(
  olderMessages: T[],
  currentMessages: T[],
  maxCount: number = LARGE_LIST_THRESHOLDS.maxRetainedChatMessages,
): T[] {
  const merged = [...olderMessages, ...currentMessages];
  if (merged.length <= maxCount) return merged;
  return merged.slice(0, maxCount);
}
