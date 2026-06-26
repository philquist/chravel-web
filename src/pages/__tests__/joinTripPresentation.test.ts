/**
 * Approval-framing spec for the JoinTrip invite page.
 *
 * Backend join policy is approval-only, so the invite page always stays in the
 * request/review framing even if legacy invite rows still carry
 * `require_approval = false`.
 */
import { describe, expect, it, vi } from 'vitest';

// JoinTrip.tsx imports heavy app modules at the top level; mock them so this
// unit test of the exported gating helper stays hermetic and fast.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: vi.fn() }, functions: { invoke: vi.fn() } },
}));
vi.mock('@/services/stream/streamMembershipCoordinator', () => ({
  reportStreamMembershipSyncFailure: vi.fn(),
  syncAddMemberToTripChannels: vi.fn(),
}));
vi.mock('@/lib/streamTripMemberInlineActivity', () => ({
  syncTripMemberToStreamAndEmitMemberJoined: vi.fn(),
}));
vi.mock('@/components/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/pendingRequestsCache', () => ({ invalidatePendingRequestState: vi.fn() }));

import { getJoinActionPresentation } from '../JoinTrip';

describe('getJoinActionPresentation', () => {
  it('keeps the request/approval framing when the invite requires approval', () => {
    const presentation = getJoinActionPresentation(true);

    expect(presentation.ctaLabel).toBe('Request to Join');
    expect(presentation.ctaBusyLabel).toBe('Requesting...');
    expect(presentation.showApprovalNotice).toBe(true);
    expect(presentation.signedOutPrompt).toBe(
      'Sign in or create a free account to request to join this trip.',
    );
  });

  it('keeps the request framing even when a legacy invite says approval is not required', () => {
    const presentation = getJoinActionPresentation(false);

    expect(presentation.ctaLabel).toBe('Request to Join');
    expect(presentation.ctaBusyLabel).toBe('Requesting...');
    expect(presentation.showApprovalNotice).toBe(true);
    expect(presentation.signedOutPrompt).toBe(
      'Sign in or create a free account to request to join this trip.',
    );
  });

  it('never leaks internal spec wording into user-facing copy', () => {
    for (const requireApproval of [true, false]) {
      const presentation = getJoinActionPresentation(requireApproval);
      const allCopy = Object.values(presentation).filter((v): v is string => typeof v === 'string');
      for (const copy of allCopy) {
        expect(copy.toLowerCase()).not.toContain('dark auth flow');
        expect(copy.toLowerCase()).not.toContain('dark modal');
      }
    }
  });
});
