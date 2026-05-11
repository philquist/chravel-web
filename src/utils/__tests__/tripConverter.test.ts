import { describe, it, expect } from 'vitest';
import {
  convertSupabaseTripToMock,
  convertSupabaseTripsToMock,
  convertSupabaseTripToProTrip,
  convertSupabaseTripToEvent,
} from '../tripConverter';
import { Trip as SupabaseTrip } from '@/services/tripService';

describe('tripConverter', () => {
  const baseSupabaseTrip: SupabaseTrip = {
    id: 'trip-123',
    name: 'Test Trip',
    destination: 'Test Location',
    description: 'A test description',
    start_date: '2023-10-01',
    end_date: '2023-10-15',
    created_by: 'user-1',
    is_archived: false,
    trip_type: 'consumer',
    cover_image_url: 'http://example.com/image.jpg',
    cover_display_mode: 'contain',
    membership_status: 'owner',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    trip_members: [{ count: 5 }],
    trip_events_places: [{ count: 3 }],
  };

  describe('convertSupabaseTripToMock', () => {
    it('converts basic fields correctly', () => {
      const mockTrip = convertSupabaseTripToMock(baseSupabaseTrip);

      expect(mockTrip.id).toBe('trip-123');
      expect(mockTrip.title).toBe('Test Trip');
      expect(mockTrip.location).toBe('Test Location');
      expect(mockTrip.description).toBe('A test description');
      expect(mockTrip.coverPhoto).toBe('http://example.com/image.jpg');
      expect(mockTrip.coverDisplayMode).toBe('contain');
      expect(mockTrip.trip_type).toBe('consumer');
      expect(mockTrip.archived).toBe(false);
      expect(mockTrip.membership_status).toBe('owner');
      expect(mockTrip.created_by).toBe('user-1');
    });

    it('provides defaults for missing optional fields', () => {
      const minimalTrip = {
        id: 'trip-123',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
      } as SupabaseTrip;

      const mockTrip = convertSupabaseTripToMock(minimalTrip);

      expect(mockTrip.title).toBe('Untitled Trip');
      expect(mockTrip.location).toBe('No destination');
      expect(mockTrip.description).toBe('');
      expect(mockTrip.dateRange).toBe('');
      expect(mockTrip.coverPhoto).toBeUndefined();
      expect(mockTrip.coverDisplayMode).toBeUndefined();
      expect(mockTrip.trip_type).toBe('consumer');
      expect(mockTrip.peopleCount).toBe(0);
      expect(mockTrip.placesCount).toBe(0);
    });

    it('normalizes legacy cover image field aliases in one place', () => {
      const snakeAliasTrip = {
        ...baseSupabaseTrip,
        cover_image_url: undefined,
        cover_photo_url: 'https://example.com/snake.jpg',
      } as SupabaseTrip & { cover_photo_url?: string };

      const camelAliasTrip = {
        ...baseSupabaseTrip,
        cover_image_url: undefined,
        coverPhotoUrl: 'https://example.com/camel.jpg',
      } as SupabaseTrip & { coverPhotoUrl?: string };

      expect(convertSupabaseTripToMock(snakeAliasTrip).coverPhoto).toBe(
        'https://example.com/snake.jpg',
      );
      expect(convertSupabaseTripToMock(camelAliasTrip).coverPhoto).toBe(
        'https://example.com/camel.jpg',
      );
    });

    it('prefers canonical cover_image_url over legacy aliases when both exist', () => {
      const mixedTrip = {
        ...baseSupabaseTrip,
        cover_image_url: 'https://example.com/canonical.jpg',
        coverPhotoUrl: 'https://example.com/legacy.jpg',
      } as SupabaseTrip & { coverPhotoUrl?: string };

      expect(convertSupabaseTripToMock(mixedTrip).coverPhoto).toBe(
        'https://example.com/canonical.jpg',
      );
    });

    it('ignores blank cover aliases', () => {
      const blankAliasTrip = {
        ...baseSupabaseTrip,
        cover_image_url: '   ',
        coverPhotoUrl: 'https://example.com/fallback.jpg',
      } as SupabaseTrip & { coverPhotoUrl?: string };

      expect(convertSupabaseTripToMock(blankAliasTrip).coverPhoto).toBe(
        'https://example.com/fallback.jpg',
      );
    });

    it('formats date range correctly when dates are valid', () => {
      const mockTrip = convertSupabaseTripToMock(baseSupabaseTrip);
      expect(mockTrip.dateRange).toBe('Oct 1 - Oct 15, 2023');
    });

    it('handles invalid date strings gracefully', () => {
      const invalidDateTrip = {
        ...baseSupabaseTrip,
        start_date: 'not-a-date',
        end_date: 'also-not-a-date',
      };
      const mockTrip = convertSupabaseTripToMock(invalidDateTrip);
      expect(mockTrip.dateRange).toBe('not-a-date - also-not-a-date');
    });

    it('returns empty date range if dates are missing', () => {
      const noDateTrip = {
        ...baseSupabaseTrip,
        start_date: undefined,
        end_date: undefined,
      };
      const mockTrip = convertSupabaseTripToMock(noDateTrip);
      expect(mockTrip.dateRange).toBe('');
    });

    it('extracts peopleCount from trip_members correctly', () => {
      const mockTrip = convertSupabaseTripToMock(baseSupabaseTrip);
      expect(mockTrip.peopleCount).toBe(5);

      const noMembersTrip = { ...baseSupabaseTrip, trip_members: [] };
      expect(convertSupabaseTripToMock(noMembersTrip).peopleCount).toBe(0);

      const undefinedMembersTrip = { ...baseSupabaseTrip };
      delete (undefinedMembersTrip as Partial<Record<keyof SupabaseTrip, unknown>>).trip_members;
      expect(convertSupabaseTripToMock(undefinedMembersTrip).peopleCount).toBe(0);
    });

    it('extracts placesCount from trip_events_places correctly', () => {
      const mockTrip = convertSupabaseTripToMock(baseSupabaseTrip);
      expect(mockTrip.placesCount).toBe(3);

      const noPlacesTrip = { ...baseSupabaseTrip, trip_events_places: [] };
      expect(convertSupabaseTripToMock(noPlacesTrip).placesCount).toBe(0);

      const undefinedPlacesTrip = { ...baseSupabaseTrip };
      delete (undefinedPlacesTrip as Partial<Record<keyof SupabaseTrip, unknown>>)
        .trip_events_places;
      expect(convertSupabaseTripToMock(undefinedPlacesTrip).placesCount).toBe(0);
    });
  });

  describe('convertSupabaseTripsToMock', () => {
    it('converts an array of Supabase trips to an array of mock trips', () => {
      const trips = [baseSupabaseTrip, { ...baseSupabaseTrip, id: 'trip-456' }];
      const mockTrips = convertSupabaseTripsToMock(trips);

      expect(mockTrips.length).toBe(2);
      expect(mockTrips[0].id).toBe('trip-123');
      expect(mockTrips[1].id).toBe('trip-456');
    });
  });

  describe('convertSupabaseTripToProTrip', () => {
    const proSupabaseTrip: SupabaseTrip = {
      ...baseSupabaseTrip,
      trip_type: 'pro',
      categories: [{ type: 'pro_category', value: 'work' }],
      card_color: '#ff0000',
    };

    it('incorporates mock trip data and default pro fields', () => {
      const proTrip = convertSupabaseTripToProTrip(proSupabaseTrip);

      expect(proTrip.id).toBe('trip-123');
      expect(proTrip.title).toBe('Test Trip');
      expect(proTrip.location).toBe('Test Location');
      expect(proTrip.dateRange).toBe('Oct 1 - Oct 15, 2023');
      expect(proTrip.trip_type).toBe('pro');
      expect(proTrip.card_color).toBe('#ff0000');

      // Pro specific fields check
      expect(proTrip.privacy_mode).toBe('standard');
      expect(proTrip.ai_access_enabled).toBe(true);
      expect(proTrip.budget.total).toBe(0);
      expect(proTrip.perDiem.currency).toBe('USD');
      expect(proTrip.perDiem.startDate).toBe('2023-10-01');
    });

    it('extracts pro_category correctly', () => {
      const proTrip = convertSupabaseTripToProTrip(proSupabaseTrip);
      expect(proTrip.proTripCategory).toBe('work');
    });

    it('handles undefined category', () => {
      const noCategoryTrip = { ...proSupabaseTrip };
      delete (noCategoryTrip as Partial<Record<keyof SupabaseTrip, unknown>>).categories;
      const proTrip = convertSupabaseTripToProTrip(noCategoryTrip);
      expect(proTrip.proTripCategory).toBe('other');
    });

    it('handles missing coverPhoto and coverDisplayMode and card_color', () => {
      const noPhotoTrip = {
        ...proSupabaseTrip,
        cover_image_url: null,
        cover_display_mode: null,
        card_color: undefined,
      };
      const proTrip = convertSupabaseTripToProTrip(noPhotoTrip);
      expect(proTrip.coverPhoto).toBeUndefined();
      expect(proTrip.coverDisplayMode).toBeUndefined();
      expect(proTrip.card_color).toBeUndefined();
    });

    it('handles null dates gracefully for perDiem fields', () => {
      const nullDateTrip = { ...proSupabaseTrip, start_date: null, end_date: null };
      const proTrip = convertSupabaseTripToProTrip(nullDateTrip as unknown as SupabaseTrip);
      expect(proTrip.perDiem.startDate).toBe('');
      expect(proTrip.perDiem.endDate).toBe('');
    });
  });

  describe('convertSupabaseTripToEvent', () => {
    const eventSupabaseTrip: SupabaseTrip = {
      ...baseSupabaseTrip,
      trip_type: 'event',
      card_color: '#00ff00',
      organizer_display_name: 'Test Organizer',
    };

    it('incorporates mock trip data and default event fields', () => {
      const eventTrip = convertSupabaseTripToEvent(eventSupabaseTrip);

      expect(eventTrip.id).toBe('trip-123');
      expect(eventTrip.title).toBe('Test Trip');
      expect(eventTrip.location).toBe('Test Location');
      expect(eventTrip.dateRange).toBe('Oct 1 - Oct 15, 2023');
      expect(eventTrip.card_color).toBe('#00ff00');
      expect(eventTrip.organizer_display_name).toBe('Test Organizer');

      // Event specific fields check
      expect(eventTrip.category).toBe('Conference');
      expect(eventTrip.capacity).toBe(100);
      expect(eventTrip.registrationStatus).toBe('open');
      expect(eventTrip.groupChatEnabled).toBe(true);
      expect(eventTrip.userRole).toBe('organizer');
    });

    it('handles missing organizer_display_name', () => {
      const noOrganizerTrip = { ...eventSupabaseTrip, organizer_display_name: null };
      const eventTrip = convertSupabaseTripToEvent(noOrganizerTrip);
      expect(eventTrip.organizer_display_name).toBeUndefined();
    });

    it('handles missing coverPhoto and coverDisplayMode and card_color', () => {
      const noPhotoTrip = {
        ...eventSupabaseTrip,
        cover_image_url: null,
        cover_display_mode: null,
        card_color: undefined,
      };
      const eventTrip = convertSupabaseTripToEvent(noPhotoTrip);
      expect(eventTrip.coverPhoto).toBeUndefined();
      expect(eventTrip.coverDisplayMode).toBeUndefined();
      expect(eventTrip.card_color).toBeUndefined();
    });
  });
});
