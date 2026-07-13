import { vi } from 'vitest';
vi.mock('https://deno.land/x/zod@v3.22.4/mod.ts', async () => {
  return await import('zod');
});
import { describe, it, expect, vi } from 'vitest';

vi.mock('https://deno.land/x/zod@v3.22.4/mod.ts', async () => {
  return await import('zod');
});
// Mock Deno global before importing the module
// intentional: Deno is injected on globalThis in the edge-runtime test boundary.
(globalThis as any).Deno = {
  env: {
    get: vi.fn().mockReturnValue('mock-key'),
  },
};

import { executeFunctionCall } from '../functionExecutor.ts';

describe('functionExecutor idempotency', () => {
  it('should correctly build payload for create_task routed to pending actions', async () => {
    // Mock Supabase — createTask now writes to trip_pending_actions
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'pending-1' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) });
    const mockTripTaskSingle = vi.fn().mockResolvedValue({ data: { id: 'task-1' }, error: null });
    const mockTripTaskSelect = vi.fn().mockReturnValue({ single: mockTripTaskSingle });
    const mockTripTaskInsert = vi.fn().mockReturnValue({ select: mockTripTaskSelect });
    const mockFrom = vi.fn((table: string) => {
      if (table === 'trip_pending_actions') return { insert: mockInsert, update: mockUpdate };
      if (table === 'trip_tasks') return { insert: mockTripTaskInsert };
      if (table === 'task_assignments' || table === 'task_status')
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { insert: vi.fn() };
    });
    const mockSupabase = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const result = await executeFunctionCall(
      mockSupabase,
      'createTask',
      { title: 'Passports', notes: 'Get them' },
      'trip-1',
      'user-1',
    );

    expect(mockFrom).toHaveBeenCalledWith('trip_pending_actions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        trip_id: 'trip-1',
        tool_name: 'createTask',
        payload: expect.objectContaining({ title: 'Passports' }),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.pending).toBe(false);
    expect(result.pendingActionId).toBe('pending-1');
  });

  it('should map idempotency_key to tool_call_id for dedup', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'pending-2' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) });
    const mockTripTaskSingle = vi.fn().mockResolvedValue({ data: { id: 'task-2' }, error: null });
    const mockTripTaskSelect = vi.fn().mockReturnValue({ single: mockTripTaskSingle });
    const mockTripTaskInsert = vi.fn().mockReturnValue({ select: mockTripTaskSelect });
    const mockFrom = vi.fn((table: string) => {
      if (table === 'trip_pending_actions') return { insert: mockInsert, update: mockUpdate };
      if (table === 'trip_tasks') return { insert: mockTripTaskInsert };
      if (table === 'task_assignments' || table === 'task_status')
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { insert: vi.fn() };
    });
    const mockSupabase = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    await executeFunctionCall(
      mockSupabase,
      'createTask',
      { title: 'Passports', notes: 'Get them', idempotency_key: 'idemp-1' },
      'trip-1',
      'user-1',
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_call_id: 'idemp-1',
      }),
    );
  });

  it('should throw on duplicate pending action (unique constraint violation)', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    const mockSupabase = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    await expect(
      executeFunctionCall(
        mockSupabase,
        'createTask',
        { title: 'Passports', notes: 'Get them', idempotency_key: 'idemp-1' },
        'trip-1',
        'user-1',
      ),
    ).rejects.toEqual({ code: '23505' });

    expect(mockFrom).toHaveBeenCalledWith('trip_pending_actions');
  });

  it('should reject addToCalendar when datetime is invalid', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'pending-3' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    const mockSupabase = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const result = await executeFunctionCall(
      mockSupabase,
      'addToCalendar',
      { title: 'Hotel', datetime: 'not-a-date' },
      'trip-1',
      'user-1',
    );

    expect(result).toEqual({ error: 'Invalid datetime. Please provide a valid date/time.' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('should persist addToCalendar with explicit endDatetime', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'pending-4' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) });
    const mockTripEventsInsert = vi.fn().mockResolvedValue({ error: { message: 'rls blocked' } });

    const mockFrom = vi.fn((table: string) => {
      if (table === 'trip_pending_actions') return { insert: mockInsert, update: mockUpdate };
      if (table === 'trip_events') return { insert: mockTripEventsInsert };
      return { insert: vi.fn() };
    });
    const mockSupabase = {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const result = await executeFunctionCall(
      mockSupabase,
      'addToCalendar',
      {
        title: 'Hotel Stay',
        datetime: '2026-06-08T00:00:00.000Z',
        endDatetime: '2026-06-23T00:00:00.000Z',
      },
      'trip-1',
      'user-1',
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          start_time: '2026-06-08T00:00:00.000Z',
          end_time: '2026-06-23T00:00:00.000Z',
        }),
      }),
    );
    expect(result.success).toBe(true);
  });
});
