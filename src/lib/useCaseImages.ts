/**
 * Closing photography for use-case articles — real photos from the existing
 * brand asset library (src/assets/trip-covers), not AI-generated imagery.
 * Each use-case page ends on one of these as an editorial closing figure;
 * the hub reuses them as story-card art.
 */
import conciergeAtlantisPoolside from '@/assets/trip-covers/concierge-atlantis-poolside.jpg';
import baliWedding from '@/assets/trip-covers/bali-destination-wedding.webp';
import groupCruiseDeckAerial from '@/assets/trip-covers/group-cruise-deck-aerial.jpg';
import youthSoccerFamily from '@/assets/trip-covers/youth-soccer-family.jpg';
import coachellaFestival from '@/assets/trip-covers/coachella-festival.webp';
import conferenceBallroom from '@/assets/trip-covers/conference-ballroom-stage.jpg';
import phoenixGolf from '@/assets/trip-covers/phoenix-golf-outing.webp';
import faithCommunityBuild from '@/assets/trip-covers/faith-community-build.jpg';
import aspenCorporate from '@/assets/trip-covers/aspen-corporate-ski.webp';
import iuMemorialStadium from '@/assets/iu-memorial-stadium-cover.jpg';

export interface UseCaseImage {
  src: string;
  alt: string;
  caption: string;
}

export const USE_CASE_IMAGES: Record<string, UseCaseImage> = {
  'travel-concierge-client-portal': {
    src: conciergeAtlantisPoolside,
    alt: 'A pro athlete and his family relaxing by the Atlantis Bahamas pool, the dad wearing a ChravelApp jersey and bucket hat',
    caption:
      'A concierge-planned family escape — every reservation, transfer, and detail already waiting in the client’s portal.',
  },
  'wedding-guest-coordination-app': {
    src: baliWedding,
    alt: 'A destination wedding ceremony set up at golden hour',
    caption:
      'The weekend runs itself when every guest already knows where to be — and every photo lands in one shared album.',
  },
  'group-travel-planning-app': {
    src: groupCruiseDeckAerial,
    alt: 'Friends relaxing together on a cruise ship pool deck with the ship and ocean in the background',
    caption: 'One trip workspace, zero “wait, where are we meeting?” texts.',
  },
  'family-organization-app': {
    src: youthSoccerFamily,
    alt: 'Kids playing a youth soccer game with parents watching from the sidelines',
    caption: 'Every practice, carpool, and game day in the family hub — not on the fridge.',
  },
  'sports-team-travel-coordination': {
    src: iuMemorialStadium,
    alt: 'Aerial view of Indiana Memorial Stadium packed with a crimson-clad crowd on game day',
    caption: 'Game day works when travel day did — rosters, buses, and schedules in one place.',
  },
  'music-tour-coordination': {
    src: coachellaFestival,
    alt: 'An artist performing on a festival main stage at night',
    caption:
      'Fifty cities, one source of truth — the show hits its cues because the crew hit theirs.',
  },
  'conference-event-management-app': {
    src: conferenceBallroom,
    alt: 'A keynote speaker on stage in front of a massive audience in a Las Vegas conference ballroom',
    caption:
      'A live agenda that survives the room swap — organizers, staff, and attendees in sync.',
  },
  'local-clubs-meetups': {
    src: phoenixGolf,
    alt: 'A golf group out on the course at sunrise',
    caption: 'The regulars always know the tee time — no plane ticket required.',
  },
  'church-group-trip-coordination': {
    src: faithCommunityBuild,
    alt: 'Volunteers in hard hats framing a house together on a community service build',
    caption: 'Lead the mission, not the group chat — rosters, forms, and families all covered.',
  },
  'business-travel-coordination': {
    src: aspenCorporate,
    alt: 'Colleagues on a company retreat in the mountains',
    caption: 'The offsite, out of your personal texts — decks, receipts, and dinners contained.',
  },
};

export const getUseCaseImage = (slug: string | undefined): UseCaseImage | undefined =>
  slug ? USE_CASE_IMAGES[slug] : undefined;
