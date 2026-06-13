import { Recommendation } from './types';
import nightlifeHighlightRoom from '@/assets/recommendations/rec-nightlife-highlight-room.svg';
import nightlifeAcademyLa from '@/assets/recommendations/rec-nightlife-academy-la.svg';
import nightlifeSoundNightclub from '@/assets/recommendations/rec-nightlife-sound-nightclub.svg';
import nightlifeExchangeLa from '@/assets/recommendations/rec-nightlife-exchange-la.svg';
import nightlifeWarwick from '@/assets/recommendations/rec-nightlife-warwick.svg';
import nightlifeEpLp from '@/assets/recommendations/rec-nightlife-ep-lp.svg';
import nightlifeEmployeesOnly from '@/assets/recommendations/rec-nightlife-employees-only.svg';
import nightlifeRogerRoom from '@/assets/recommendations/rec-nightlife-roger-room.svg';
import nightlifeMamaShelter from '@/assets/recommendations/rec-nightlife-mama-shelter.svg';
import nightlifeBarLis from '@/assets/recommendations/rec-nightlife-bar-lis.svg';

export const nightlifeRecommendations: Recommendation[] = [
  [
    'The Highlight Room',
    'Hollywood rooftop lounge with skyline views, dinner service, and late-night energy.',
    '6417 Selma Ave, Hollywood, Los Angeles, CA',
    'https://taogroup.com/venues/the-highlight-room-los-angeles/',
    'View Venue',
    ['Nightlife', 'Rooftop', 'Hollywood'],
    nightlifeHighlightRoom,
  ],
  [
    'Academy LA',
    'Large-format Hollywood club known for touring DJs, immersive lighting, and dance-forward nights.',
    '6021 Hollywood Blvd, Los Angeles, CA',
    'https://www.academy.la/',
    'Explore Nightlife',
    ['Nightlife', 'Club', 'Hollywood'],
    nightlifeAcademyLa,
  ],
  [
    'Sound Nightclub',
    'Intimate Hollywood electronic music venue with a strong late-night calendar.',
    '1642 N Las Palmas Ave, Los Angeles, CA',
    'https://www.soundnightclub.com/',
    'View Venue',
    ['Nightlife', 'Club', 'Music'],
    nightlifeSoundNightclub,
  ],
  [
    'Exchange LA',
    'Downtown LA nightlife venue in a historic stock exchange building with major DJ bookings.',
    '618 S Spring St, Downtown Los Angeles, CA',
    'https://exchangela.com/',
    'Plan Night Out',
    ['Nightlife', 'Club', 'Downtown LA'],
    nightlifeExchangeLa,
  ],
  [
    'Warwick',
    'Hollywood lounge and club with an upscale, guest-list-friendly night-out format.',
    '6507 Sunset Blvd, Los Angeles, CA',
    'https://warwickla.com/',
    'View Venue',
    ['Nightlife', 'Lounge', 'Hollywood'],
    nightlifeWarwick,
  ],
  [
    'EP & LP',
    'West Hollywood restaurant, bar, and rooftop destination for cocktails and city views.',
    '603 N La Cienega Blvd, West Hollywood, CA',
    'https://www.eplosangeles.com/',
    'Plan Night Out',
    ['Nightlife', 'Rooftop', 'Cocktails'],
    nightlifeEpLp,
  ],
  [
    'Employees Only LA',
    'Cocktail bar with a speakeasy feel, dinner options, and polished late-night service.',
    '7953 Santa Monica Blvd, West Hollywood, CA',
    'https://www.employeesonlyla.com/',
    'View Venue',
    ['Nightlife', 'Cocktails', 'Lounge'],
    nightlifeEmployeesOnly,
  ],
  [
    'The Roger Room',
    'Classic West Hollywood cocktail bar for a lower-key pre-show or late-night stop.',
    '370 La Cienega Blvd, Los Angeles, CA',
    'https://therogerroom.com/',
    'Explore Nightlife',
    ['Nightlife', 'Cocktails', 'West Hollywood'],
    nightlifeRogerRoom,
  ],
  [
    'Mama Shelter Rooftop',
    'Casual Hollywood rooftop bar with colorful design, group-friendly drinks, and views.',
    '6500 Selma Ave, Hollywood, Los Angeles, CA',
    'https://mamashelter.com/los-angeles/rooftop/',
    'Plan Night Out',
    ['Nightlife', 'Rooftop', 'Hollywood'],
    nightlifeMamaShelter,
  ],
  [
    'Bar Lis',
    'French Riviera-inspired rooftop lounge in Hollywood with cocktails, music, and views.',
    '1541 Wilcox Ave, Hollywood, Los Angeles, CA',
    'https://www.barlisla.com/',
    'View Venue',
    ['Nightlife', 'Rooftop', 'Lounge'],
    nightlifeBarLis,
  ],
].map(([title, description, location, externalLink, ctaText, tags, image], index) => ({
  id: 301 + index,
  type: 'nightlife',
  title,
  location,
  city: 'Los Angeles',
  description,
  rating: 4.5 + (index % 4) / 10,
  priceLevel: index % 3 === 0 ? 4 : 3,
  images: [image],
  tags,
  isSponsored: false,
  ctaButton: { text: ctaText, action: 'view' },
  externalLink,
  distance: 'Los Angeles nightlife',
  isAvailable: true,
})) as Recommendation[];
