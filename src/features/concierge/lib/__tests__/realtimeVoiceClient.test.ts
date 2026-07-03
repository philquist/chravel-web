import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRealtimeSetupUrl,
  DEFAULT_REALTIME_VOICE_MODEL,
  executeRealtimeTool,
  fetchRealtimeSessionConfig,
  preflightRealtimeSetup,
} from '../realtimeVoiceClient';

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

describe('buildRealtimeSetupUrl', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
  });
  afterEach(() => vi.restoreAllMocks());

  // The AI SDK POSTs to this URL (as `api.token`) with NO Authorization header, so the
  // JWT must ride in the query string for mint-realtime-token to auth + rate-limit the user.
  it('targets mint-realtime-token with jwt, model, and apikey query params', async () => {
    const raw = await buildRealtimeSetupUrl();
    const url = new URL(raw);
    expect(url.origin + url.pathname).toBe(
      'https://project.supabase.co/functions/v1/mint-realtime-token',
    );
    expect(url.searchParams.get('jwt')).toBe('jwt-123');
    expect(url.searchParams.get('model')).toBe(DEFAULT_REALTIME_VOICE_MODEL);
    // Supabase's function gateway (verify_jwt=false) still requires the anon apikey.
    expect(url.searchParams.get('apikey')).toBe('anon-key');
  });

  it('honors an explicit model override', async () => {
    const url = new URL(await buildRealtimeSetupUrl('openai/gpt-realtime-mini'));
    expect(url.searchParams.get('model')).toBe('openai/gpt-realtime-mini');
  });

  it('throws when the user is not authenticated', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(buildRealtimeSetupUrl()).rejects.toThrow('Not authenticated');
  });
});

describe('preflightRealtimeSetup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('POSTs the same body shape the SDK sends and resolves on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '{"token":"t","url":"wss://x"}' });
    vi.stubGlobal('fetch', fetchMock);

    const sessionConfig = { instructions: 'hi', voice: 'sage', tools: [] };
    await expect(
      preflightRealtimeSetup('https://project.supabase.co/functions/v1/mint?jwt=j', sessionConfig),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/mint?jwt=j');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ sessionConfig });
  });

  // The whole point of the preflight: the SDK swallows error bodies, so this must
  // surface the server's own message (e.g. the Gateway's mint failure reason).
  it('throws with the status and the server error text on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () =>
        JSON.stringify({
          error: 'Gateway mint failed. openai/gpt-realtime-2 → 400: expiresIn cap',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(preflightRealtimeSetup('https://x/mint', {})).rejects.toThrow(
      'Voice setup failed (502): Gateway mint failed. openai/gpt-realtime-2 → 400: expiresIn cap',
    );
  });

  it('falls back to the raw body when the failure response is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '<!doctype html>not found',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(preflightRealtimeSetup('https://x/mint', {})).rejects.toThrow(
      'Voice setup failed (404): <!doctype html>not found',
    );
  });
});

describe('fetchRealtimeSessionConfig', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads the trip-aware instructions + chosen voice + tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        instructions: 'You are the concierge for Trip 9.',
        voice: 'sage',
        tools: [{ type: 'function', name: 'getTripInfo', parameters: {} }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = await fetchRealtimeSessionConfig('trip-9');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/realtime-voice-session');
    expect(init.headers.Authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(init.body).tripId).toBe('trip-9');
    // The voice selection made in settings flows straight into the session config.
    expect(config.voice).toBe('sage');
    expect(config.tools).toHaveLength(1);
  });

  it('surfaces a server error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Trip access denied.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRealtimeSessionConfig('trip-9')).rejects.toThrow('Trip access denied.');
  });
});
