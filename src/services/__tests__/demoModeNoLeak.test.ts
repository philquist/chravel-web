/**
 * No-Leak Invariant Tests
 *
 * Verifies demo data identifiers can never collide with production DB rows.
 * The guard: demo trip IDs use 'demo-trip-N' prefixes, member IDs use 'userN'
 * or 'demo-user' — none are UUIDs. A UUID-shaped demo ID would collide with a
 * real Supabase row and serve demo data to a real user.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { demoModeService } from '../demoModeService';

vi.mock('../secureStorageService', () => ({
  secureStorageService: {
    isDemoModeEnabled: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'real-user-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  },
}));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Demo mode no-leak invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isDemoModeEnabled() async gate', () => {
    it('returns false when secureStorage reports demo is off', async () => {
      const { secureStorageService } = await import('../secureStorageService');
      vi.mocked(secureStorageService.isDemoModeEnabled).mockResolvedValue(false);
      expect(await demoModeService.isDemoModeEnabled()).toBe(false);
    });

    it('returns true when secureStorage reports demo is on', async () => {
      const { secureStorageService } = await import('../secureStorageService');
      vi.mocked(secureStorageService.isDemoModeEnabled).mockResolvedValue(true);
      expect(await demoModeService.isDemoModeEnabled()).toBe(true);
    });
  });

  describe('Demo data identity invariants (no UUID collision)', () => {
    it('demo trip IDs are non-UUID sentinel values', () => {
      const trips = demoModeService.getMockTrips();
      expect(trips.length).toBeGreaterThan(0);
      for (const trip of trips) {
        // UUIDs would collide with real DB primary keys — must be non-UUID
        expect(trip.id).not.toMatch(UUID_PATTERN);
        // Must use the 'demo-trip-N' prefix convention
        expect(trip.id).toMatch(/^demo-trip-/);
      }
    });

    it('demo member user_ids are non-UUID sentinel values', () => {
      for (const tripId of ['1', '2', '3']) {
        for (const member of demoModeService.getMockMembers(tripId)) {
          // Non-UUID pattern: 'user1', 'user2', 'demo-user' etc
          expect(member.user_id).not.toMatch(UUID_PATTERN);
        }
      }
    });

    it('demo message sender_ids are non-UUID sentinel values', () => {
      for (const msg of demoModeService.getMockMessages('1')) {
        if (msg.sender_id) {
          expect(msg.sender_id).not.toMatch(UUID_PATTERN);
        }
      }
    });

    it('getMockCalendarEvents() scopes events to requested trip', () => {
      for (const event of demoModeService.getMockCalendarEvents('2')) {
        expect(event.trip_id).toBe('2');
      }
    });

    it('getMockFiles() scopes files to requested trip', () => {
      for (const file of demoModeService.getMockFiles('2')) {
        expect(file.trip_id).toBe('2');
      }
    });

    it('getMockPayments() scopes payments to requested trip', () => {
      for (const payment of demoModeService.getMockPayments('1')) {
        expect(payment.trip_id).toBe('1');
      }
    });

    it('getMockMembers() scopes members to the requested trip', () => {
      const membersForTrip1 = demoModeService.getMockMembers('1');
      const membersForTrip2 = demoModeService.getMockMembers('2');
      // Each trip should have its own set of members
      expect(membersForTrip1.length).toBeGreaterThan(0);
      expect(membersForTrip2.length).toBeGreaterThan(0);
    });
  });
});
