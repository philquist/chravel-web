export type ChatSearchableMessage = {
  text?: string | null;
  content?: string | null;
  sender?: { name?: string | null } | null;
  attachments?: Array<{ transcript?: string | null } | null> | null;
};

/**
 * Local inline chat search matcher.
 * Includes attachment transcripts so voice notes remain findable when the bubble
 * text is empty / "Voice note".
 */
export function messageMatchesChatSearchQuery(
  message: ChatSearchableMessage,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return false;

  const text = String(message.text || message.content || '').toLowerCase();
  const sender = String(message.sender?.name || '').toLowerCase();
  const transcripts = (message.attachments || [])
    .map(attachment => String(attachment?.transcript || '').toLowerCase())
    .join(' ');

  return text.includes(query) || sender.includes(query) || transcripts.includes(query);
}
