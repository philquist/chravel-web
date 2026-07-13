import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildRecommitIdempotencyKey,
  resolveFinalizeStatus,
  shouldReuseExistingImportBatch,
} from '@/features/calendar/utils/calendarImportBatch';

describe('calendarImportBatch helpers', () => {
  it('refuses to reuse reverted or cancelled batches', () => {
    expect(shouldReuseExistingImportBatch('reverted')).toBe(false);
    expect(shouldReuseExistingImportBatch('cancelled')).toBe(false);
  });

  it('reuses active and completed batches for idempotent retries', () => {
    expect(shouldReuseExistingImportBatch('committing')).toBe(true);
    expect(shouldReuseExistingImportBatch('completed')).toBe(true);
    expect(shouldReuseExistingImportBatch('partially_completed')).toBe(true);
    expect(shouldReuseExistingImportBatch('failed')).toBe(true);
  });

  it('builds a distinct recommit idempotency key', () => {
    const base = 'batch:abc:5';
    const next = buildRecommitIdempotencyKey(base, 1_720_000_000_000);
    expect(next).toBe('batch:abc:5:recommit:1720000000000');
    expect(next).not.toBe(base);
  });

  it('resolves finalize status from counts', () => {
    expect(resolveFinalizeStatus({ imported: 10, skipped: 0, failed: 0 })).toBe('completed');
    expect(resolveFinalizeStatus({ imported: 8, skipped: 1, failed: 2 })).toBe(
      'partially_completed',
    );
    expect(resolveFinalizeStatus({ imported: 0, skipped: 0, failed: 3 })).toBe('failed');
    expect(resolveFinalizeStatus({ imported: 0, skipped: 5, failed: 0 })).toBe('completed');
  });
});

describe('createCalendarImportBatch terminal reuse', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('mints a recommit key instead of reusing a reverted batch', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'old-batch',
        trip_id: 'trip-1',
        created_by: 'user-1',
        source_format: 'csv',
        status: 'reverted',
        events_imported: 5,
        events_skipped: 0,
        events_failed: 0,
      },
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'new-batch',
        trip_id: 'trip-1',
        created_by: 'user-1',
        source_format: 'csv',
        status: 'committing',
        events_imported: 0,
        events_skipped: 0,
        events_failed: 0,
      },
      error: null,
    });

    const from = vi.fn((table: string) => {
      expect(table).toBe('calendar_import_batches');
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        }),
        insert: (payload: { idempotency_key: string }) => {
          expect(payload.idempotency_key).toContain(':recommit:');
          return {
            select: () => ({
              single: insertSingle,
            }),
          };
        },
      };
    });

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        },
        from,
        rpc: vi.fn(),
      },
    }));

    const { createCalendarImportBatch } =
      await import('@/features/calendar/utils/calendarImportBatch');
    const batch = await createCalendarImportBatch({
      tripId: 'trip-1',
      sourceFormat: 'csv',
      idempotencyKey: 'batch:abc:5',
    });

    expect(batch?.id).toBe('new-batch');
    expect(maybeSingle).toHaveBeenCalled();
    expect(insertSingle).toHaveBeenCalled();
  });
});

describe('finalizeCalendarImportBatch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws when the finalize RPC fails', async () => {
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        auth: { getUser: vi.fn() },
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not authorized to finalize this import' },
        }),
      },
    }));

    const { finalizeCalendarImportBatch } =
      await import('@/features/calendar/utils/calendarImportBatch');

    await expect(
      finalizeCalendarImportBatch('batch-1', { imported: 2, skipped: 0, failed: 0 }),
    ).rejects.toThrow(/Not authorized to finalize/);
  });
});
