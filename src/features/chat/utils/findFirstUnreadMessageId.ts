/**
 * Find the first unread message id for the current user given Stream last_read.
 * Used once per chat mount for the iMessage-style "New Messages" divider.
 */
export function findFirstUnreadMessageId(params: {
  messages: Array<{
    id: string;
    createdAt?: string;
    created_at?: string;
    sender?: { id?: string; userId?: string };
    user_id?: string;
    user?: { id?: string };
  }>;
  currentUserId: string | null | undefined;
  lastRead?: string | Date | null;
}): string | null {
  const { messages, currentUserId, lastRead } = params;
  if (!currentUserId || !lastRead || messages.length === 0) return null;

  const lastReadDate = new Date(lastRead);
  if (Number.isNaN(lastReadDate.getTime())) return null;

  for (const message of messages) {
    const senderId =
      message.sender?.userId ||
      message.sender?.id ||
      message.user_id ||
      message.user?.id;
    if (!senderId || senderId === currentUserId) continue;

    const createdAt = new Date(message.createdAt || message.created_at || 0);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt > lastReadDate) return message.id;
  }

  return null;
}
