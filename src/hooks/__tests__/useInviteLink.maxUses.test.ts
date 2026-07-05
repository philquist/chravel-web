/**
 * Invite usage-limit spec: the trip_invites insert must include max_uses when
 * a positive limit is set, and omit the column entirely when the limit is off
 * (so the database default/null semantics stay untouched).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useInviteLink } from '../useInviteLink';

const insertMock = vi.fn();
let mockIsDemoMode = false;

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/unfurlConfig', () => ({
  buildInviteLink: (code: string) => `https://chravel.app/join/${code}`,
}));

vi.mock('@/integrations/supabase/client', () => {
  const tripsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        created_by: 'user-1',
        trip_type: 'consumer',
      },
      error: null,
    }),
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'trips') return tripsChain;
        if (table === 'trip_invites') {
          return {
            insert: insertMock,
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    },
  };
});

const VALID_TRIP_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function renderInviteLink(maxUses: number | null | undefined) {
  return renderHook(() =>
    useInviteLink({
      isOpen: true,
      tripName: 'Test Trip',
      expireIn7Days: false,
      maxUses,
      tripId: VALID_TRIP_ID,
    }),
  );
}

async function getInsertedInvite(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
  const insertArg = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
  expect(Array.isArray(insertArg)).toBe(true);
  return insertArg[0];
}

describe('useInviteLink max_uses persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDemoMode = false;
    insertMock.mockResolvedValue({ error: null });
  });

  it('includes max_uses in the invite insert when a limit is set', async () => {
    renderInviteLink(25);

    const payload = await getInsertedInvite();
    expect(payload.max_uses).toBe(25);
    expect(payload.trip_id).toBe(VALID_TRIP_ID);
    expect(payload.require_approval).toBe(true);
  });

  it('omits max_uses entirely when the limit is off (null)', async () => {
    renderInviteLink(null);

    const payload = await getInsertedInvite();
    expect(payload).not.toHaveProperty('max_uses');
  });

  it('omits max_uses when the prop is undefined', async () => {
    renderInviteLink(undefined);

    const payload = await getInsertedInvite();
    expect(payload).not.toHaveProperty('max_uses');
  });

  it('omits max_uses for invalid (non-positive) limits', async () => {
    renderInviteLink(0);

    const payload = await getInsertedInvite();
    expect(payload).not.toHaveProperty('max_uses');
  });

  it('creates a database-backed invite for real UUID trips even when demo mode is active', async () => {
    mockIsDemoMode = true;

    const { result } = renderInviteLink(null);

    const payload = await getInsertedInvite();
    expect(payload.trip_id).toBe(VALID_TRIP_ID);
    await waitFor(() =>
      expect(result.current.inviteLink).toMatch(/^https:\/\/chravel\.app\/join\/chravel/),
    );
    expect(result.current.inviteLink).not.toContain('/demo-');
  });
});
