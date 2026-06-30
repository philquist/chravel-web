import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeRealtimeTool } from '../realtimeVoiceClient';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: getSessionMock } },
  SUPABASE_PROJECT_URL: 'https://project.supabase.co',
  SUPABASE_PUBLIC_ANON_KEY: 'anon-key',
}));

describe('executeRealtimeTool', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes the tool call to execute-concierge-tool with auth + trip scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'evt-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeRealtimeTool('trip-9', 'addToCalendar', {
      title: 'Dinner',
      idempotency_key: 'idem-abc',
    });

    expect(result).toEqual({ success: true, id: 'evt-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/execute-concierge-tool');
    expect(init.headers.Authorization).toBe('Bearer jwt-123');
    expect(init.headers.apikey).toBe('anon-key');
    const body = JSON.parse(init.body);
    expect(body.toolName).toBe('addToCalendar');
    expect(body.tripId).toBe('trip-9');
    // Prefer the model-provided idempotency key for mutating tools.
    expect(body.idempotencyKey).toBe('idem-abc');
  });

  it('falls back to the stable tool-call id so retries of the same call stay idempotent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await executeRealtimeTool('trip-9', 'addExpense', { amount: 20 }, 'call_abc');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Same tool call retried → same key → server dedupes the mutation.
    expect(body.idempotencyKey).toBe('call_abc');
  });

  it('generates a UUID only when neither args nor a tool-call id provide a key', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'gen-uuid-1' as ReturnType<typeof crypto.randomUUID>,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await executeRealtimeTool('trip-9', 'getPaymentSummary', {});

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.idempotencyKey).toBe('gen-uuid-1');
  });

  it('returns a structured error (does not throw) when the tool fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Too many AI tool requests.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeRealtimeTool('trip-9', 'createTask', { title: 'x' });

    expect(result).toEqual({ success: false, error: 'Too many AI tool requests.' });
  });

  it('throws when the user is not authenticated', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(executeRealtimeTool('trip-9', 'getTripInfo', {})).rejects.toThrow(
      'Not authenticated',
    );
  });
});
