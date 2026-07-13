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

export async function createCalendarImportBatch(
  input: CreateCalendarImportBatchInput,
): Promise<CalendarImportBatchRecord | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be logged in to import events.');

  const payload = {
    trip_id: input.tripId,
    created_by: user.id,
    source_format: input.sourceFormat,
    source_label: input.sourceLabel ?? null,
    source_url: input.sourceUrl ?? null,
    status: 'committing' as const,
    idempotency_key: input.idempotencyKey ?? null,
    warnings: input.warnings ?? [],
  };

  // Prefer upsert on trip+idempotency so retries reuse the same batch.
  if (input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from('calendar_import_batches')
      .select(
        'id, trip_id, created_by, source_format, status, events_imported, events_skipped, events_failed',
      )
      .eq('trip_id', input.tripId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (existingError && import.meta.env.DEV) {
      console.warn('[calendarImportBatch] lookup failed:', existingError.message);
    }

    if (existing) {
      return existing as CalendarImportBatchRecord;
    }
  }

  const { data, error } = await supabase
    .from('calendar_import_batches')
    .insert(payload)
    .select(
      'id, trip_id, created_by, source_format, status, events_imported, events_skipped, events_failed',
    )
    .single();

  if (error) {
    // Unique race: another tab inserted first — re-read.
    if (input.idempotencyKey && error.code === '23505') {
      const { data: raced } = await supabase
        .from('calendar_import_batches')
        .select(
          'id, trip_id, created_by, source_format, status, events_imported, events_skipped, events_failed',
        )
        .eq('trip_id', input.tripId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      if (raced) return raced as CalendarImportBatchRecord;
    }
    throw new Error(`Failed to create import batch: ${error.message}`);
  }

  return data as CalendarImportBatchRecord;
}

export async function finalizeCalendarImportBatch(
  batchId: string,
  counts: { imported: number; skipped: number; failed: number },
): Promise<void> {
  const status: CalendarImportBatchStatus =
    counts.imported > 0 && counts.failed > 0
      ? 'partially_completed'
      : counts.imported > 0
        ? 'completed'
        : counts.failed > 0
          ? 'failed'
          : 'completed';

  const { error } = await supabase
    .from('calendar_import_batches')
    .update({
      status,
      events_imported: counts.imported,
      events_skipped: counts.skipped,
      events_failed: counts.failed,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  if (error && import.meta.env.DEV) {
    console.warn('[calendarImportBatch] finalize failed:', error.message);
  }
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
