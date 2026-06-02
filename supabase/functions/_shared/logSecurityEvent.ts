import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Append-only security audit writer for the `security_audit_log` table.
 *
 * IMPORTANT: this writes the table's ACTUAL live columns
 *   (id, user_id, action, table_name, record_id, metadata, created_at)
 * — the same shape `log-auth-event` uses. The older `_shared/security.ts`
 * `logSecurityEvent` wrote `{event_type, details, ip_address}`, none of which
 * exist on the table, so those inserts silently failed. Use THIS helper.
 *
 * Fail-open by design: audit logging must NEVER block the calling code path
 * (e.g. token issuance). All errors are caught and logged, never thrown.
 */
export interface SecurityEventInput {
  /** JWT-verified user id, or null for anonymous/pre-auth events. */
  userId: string | null;
  /** Dotted event name, e.g. 'stream.token_issued' | 'livekit.token_issued'. */
  action: string;
  /** Logical subject of the event. Maps to the NOT NULL `table_name` column. */
  tableName?: string;
  /** Optional related record id. */
  recordId?: string | null;
  /** Arbitrary structured context (ip, trip_id, room, etc.). */
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(
  adminClient: SupabaseClient,
  event: SecurityEventInput,
): Promise<void> {
  try {
    const { error } = await adminClient.from('security_audit_log').insert({
      user_id: event.userId,
      action: event.action,
      table_name: event.tableName ?? 'edge_function',
      record_id: event.recordId ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) {
      console.error('[logSecurityEvent] insert failed:', event.action, error.message);
    }
  } catch (err) {
    console.error(
      '[logSecurityEvent] threw:',
      event.action,
      err instanceof Error ? err.message : err,
    );
  }
}
