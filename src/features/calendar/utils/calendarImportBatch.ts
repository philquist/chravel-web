/**
 * Client helpers for durable calendar import batches + undo.
 */

import { supabase } from '@/integrations/supabase/client';

export type CalendarImportBatchStatus =
  | 'draft'
  | 'processing'
  | 'ready_for_review'
  | 'committing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled'
  | 'reverted';

export interface CreateCalendarImportBatchInput {
  tripId: string;
  sourceFormat: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  idempotencyKey?: string | null;
  warnings?: string[];
}

export interface CalendarImportBatchRecord {
  id: string;
  trip_id: string;
  created_by: string;
  source_format: string;
  status: CalendarImportBatchStatus;
  events_imported: number;
  events_skipped: number;
  events_failed: number;
}

export interface UndoCalendarImportBatchResult {
  batch_id: string;
  status: string;
  reverted: number;
  conflicted: number;
  already_gone: number;
  repeat_safe: boolean;
}

const BATCH_SELECT =
  'id, trip_id, created_by, source_format, status, events_imported, events_skipped, events_failed';

/** Terminal batches must not be reused — undo short-circuit / unique key would break re-import. */
export function shouldReuseExistingImportBatch(status: string): boolean {
  return status !== 'reverted' && status !== 'cancelled';
}

/** Fresh idempotency key after a terminal batch so UNIQUE(trip_id, key) allows a new row. */
export function buildRecommitIdempotencyKey(baseKey: string, nowMs: number = Date.now()): string {
  return `${baseKey}:recommit:${nowMs}`;
}

export function resolveFinalizeStatus(counts: {
  imported: number;
  skipped: number;
  failed: number;
}): CalendarImportBatchStatus {
  if (counts.imported > 0 && counts.failed > 0) return 'partially_completed';
  if (counts.imported > 0) return 'completed';
  if (counts.failed > 0) return 'failed';
  return 'completed';
}

async function fetchBatchByIdempotency(
  tripId: string,
  idempotencyKey: string,
): Promise<CalendarImportBatchRecord | null> {
  const { data, error } = await supabase
    .from('calendar_import_batches')
    .select(BATCH_SELECT)
    .eq('trip_id', tripId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error && import.meta.env.DEV) {
    console.warn('[calendarImportBatch] lookup failed:', error.message);
  }

  return (data as CalendarImportBatchRecord | null) ?? null;
}

export async function createCalendarImportBatch(
  input: CreateCalendarImportBatchInput,
): Promise<CalendarImportBatchRecord | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be logged in to import events.');

  let idempotencyKey = input.idempotencyKey ?? null;

  // Prefer reuse on trip+idempotency so retries share a batch — but never reuse
  // terminal reverted/cancelled rows (undo would no-op while new events remain).
  if (idempotencyKey) {
    const existing = await fetchBatchByIdempotency(input.tripId, idempotencyKey);
    if (existing) {
      if (shouldReuseExistingImportBatch(existing.status)) {
        return existing;
      }
      idempotencyKey = buildRecommitIdempotencyKey(idempotencyKey);
    }
  }

  const payload = {
    trip_id: input.tripId,
    created_by: user.id,
    source_format: input.sourceFormat,
    source_label: input.sourceLabel ?? null,
    source_url: input.sourceUrl ?? null,
    status: 'committing' as const,
    idempotency_key: idempotencyKey,
    warnings: input.warnings ?? [],
  };

  const { data, error } = await supabase
    .from('calendar_import_batches')
    .insert(payload)
    .select(BATCH_SELECT)
    .single();

  if (error) {
    // Unique race: another tab inserted first — re-read.
    if (idempotencyKey && error.code === '23505') {
      const raced = await fetchBatchByIdempotency(input.tripId, idempotencyKey);
      if (raced && shouldReuseExistingImportBatch(raced.status)) {
        return raced;
      }
      // Terminal raced row: mint another key and insert once more.
      if (raced && input.idempotencyKey) {
        const retryKey = buildRecommitIdempotencyKey(input.idempotencyKey);
        const { data: retryData, error: retryError } = await supabase
          .from('calendar_import_batches')
          .insert({ ...payload, idempotency_key: retryKey })
          .select(BATCH_SELECT)
          .single();
        if (retryError) {
          throw new Error(`Failed to create import batch: ${retryError.message}`);
        }
        return retryData as CalendarImportBatchRecord;
      }
    }
    throw new Error(`Failed to create import batch: ${error.message}`);
  }

  return data as CalendarImportBatchRecord;
}

export async function finalizeCalendarImportBatch(
  batchId: string,
  counts: { imported: number; skipped: number; failed: number },
): Promise<void> {
  const { data, error } = await supabase.rpc('finalize_calendar_import_batch', {
    p_batch_id: batchId,
    p_imported: counts.imported,
    p_skipped: counts.skipped,
    p_failed: counts.failed,
  });

  if (error) {
    throw new Error(error.message || 'Failed to finalize import batch');
  }

  // RPC returns jsonb; treat null/empty as success if no error.
  void data;
}

export async function undoCalendarImportBatch(
  batchId: string,
  options?: { forceDeleteEdited?: boolean },
): Promise<UndoCalendarImportBatchResult> {
  const { data, error } = await supabase.rpc('undo_calendar_import_batch', {
    p_batch_id: batchId,
    p_force_delete_edited: options?.forceDeleteEdited ?? false,
  });

  if (error) {
    throw new Error(error.message || 'Failed to undo import');
  }

  const result = (data ?? {}) as Partial<UndoCalendarImportBatchResult>;
  return {
    batch_id: result.batch_id ?? batchId,
    status: result.status ?? 'reverted',
    reverted: result.reverted ?? 0,
    conflicted: result.conflicted ?? 0,
    already_gone: result.already_gone ?? 0,
    repeat_safe: result.repeat_safe ?? true,
  };
}
