type RecommendationImageKind =
  | 'arena'
  | 'ballpark'
  | 'bar'
  | 'campus'
  | 'club'
  | 'harbor'
  | 'hills'
  | 'ice'
  | 'lounge'
  | 'pitch'
  | 'pyramid'
  | 'rooftop'
  | 'ruins'
  | 'stadium'
  | 'tower';

type RecommendationImageConfig = {
  title: string;
  kicker: string;
  tag: string;
  place: string;
  bg: string;
  accent: string;
  kind: RecommendationImageKind;
};

export type RecommendationImageKey =
  | 'sports-lakers'
  | 'sports-clippers'
  | 'sports-rams'
  | 'sports-chargers'
  | 'sports-dodgers'
  | 'sports-angels'
  | 'sports-kings'
  | 'sports-lafc'
  | 'sports-galaxy'
  | 'sports-usc'
  | 'sports-ucla'
  | 'nightlife-highlight-room'
  | 'nightlife-academy-la'
  | 'nightlife-sound-nightclub'
  | 'nightlife-exchange-la'
  | 'nightlife-warwick'
  | 'nightlife-ep-lp'
  | 'nightlife-employees-only'
  | 'nightlife-roger-room'
  | 'nightlife-mama-shelter'
  | 'nightlife-bar-lis'
  | 'landmark-hollywood-sign'
  | 'landmark-pyramids-giza'
  | 'landmark-templo-mayor'
  | 'landmark-eiffel-tower'
  | 'landmark-sydney-opera-house';

const imageConfigs: Record<RecommendationImageKey, RecommendationImageConfig> = {
  'sports-lakers': {
    title: 'Los Angeles Lakers',
    kicker: 'NBA',
    tag: 'Sports',
    place: 'Los Angeles',
    bg: '#552583',
    accent: '#FDB927',
    kind: 'arena',
  },
  'sports-clippers': {
    title: 'LA Clippers',
    kicker: 'NBA',
    tag: 'Sports',
    place: 'Inglewood',
    bg: '#1D428A',
    accent: '#C8102E',
    kind: 'arena',
  },
  'sports-rams': {
    title: 'Los Angeles Rams',
    kicker: 'NFL',
    tag: 'Sports',
    place: 'SoFi Stadium',
    bg: '#003594',
    accent: '#FFA300',
    kind: 'stadium',
  },
  'sports-chargers': {
    title: 'LA Chargers',
    kicker: 'NFL',
    tag: 'Sports',
    place: 'SoFi Stadium',
    bg: '#0080C6',
    accent: '#FFC20E',
    kind: 'stadium',
  },
  'sports-dodgers': {
    title: 'LA Dodgers',
    kicker: 'MLB',
    tag: 'Sports',
    place: 'Dodger Stadium',
    bg: '#005A9C',
    accent: '#FFFFFF',
    kind: 'ballpark',
  },
  'sports-angels': {
    title: 'LA Angels',
    kicker: 'MLB',
    tag: 'Sports',
    place: 'Greater LA',
    bg: '#BA0021',
    accent: '#003263',
    kind: 'ballpark',
  },
  'sports-kings': {
    title: 'LA Kings',
    kicker: 'NHL',
    tag: 'Sports',
    place: 'Crypto.com Arena',
    bg: '#111111',
    accent: '#A2AAAD',
    kind: 'ice',
  },
  'sports-lafc': {
    title: 'LAFC',
    kicker: 'MLS',
    tag: 'Sports',
    place: 'BMO Stadium',
    bg: '#111111',
    accent: '#C39E6D',
    kind: 'pitch',
  },
  'sports-galaxy': {
    title: 'LA Galaxy',
    kicker: 'MLS',
    tag: 'Sports',
    place: 'Greater LA',
    bg: '#00245D',
    accent: '#FFC72C',
    kind: 'pitch',
  },
  'sports-usc': {
    title: 'USC Trojans',
    kicker: 'College',
    tag: 'Athletics',
    place: 'Coliseum',
    bg: '#990000',
    accent: '#FFC72C',
    kind: 'campus',
  },
  'sports-ucla': {
    title: 'UCLA Bruins',
    kicker: 'College',
    tag: 'Athletics',
    place: 'Rose Bowl',
    bg: '#2774AE',
    accent: '#FFD100',
    kind: 'campus',
  },
  'nightlife-highlight-room': {
    title: 'The Highlight Room',
    kicker: 'Rooftop',
    tag: 'Nightlife',
    place: 'Hollywood',
    bg: '#2E1065',
    accent: '#F59E0B',
    kind: 'rooftop',
  },
  'nightlife-academy-la': {
    title: 'Academy LA',
    kicker: 'Club',
    tag: 'Nightlife',
    place: 'Hollywood',
    bg: '#111827',
    accent: '#A855F7',
    kind: 'club',
  },
  'nightlife-sound-nightclub': {
    title: 'Sound Nightclub',
    kicker: 'Music',
    tag: 'Nightlife',
    place: 'Hollywood',
    bg: '#0F172A',
    accent: '#22D3EE',
    kind: 'club',
  },
  'nightlife-exchange-la': {
    title: 'Exchange LA',
    kicker: 'Club',
    tag: 'Nightlife',
    place: 'Downtown LA',
    bg: '#1E1B4B',
    accent: '#F97316',
    kind: 'club',
  },
  'nightlife-warwick': {
    title: 'Warwick',
    kicker: 'Lounge',
    tag: 'Nightlife',
    place: 'Hollywood',
    bg: '#3B0764',
    accent: '#FACC15',
    kind: 'lounge',
  },
  'nightlife-ep-lp': {
    title: 'EP & LP',
    kicker: 'Rooftop',
    tag: 'Cocktails',
    place: 'West Hollywood',
    bg: '#064E3B',
    accent: '#FBBF24',
    kind: 'rooftop',
  },
  'nightlife-employees-only': {
    title: 'Employees Only LA',
    kicker: 'Cocktails',
    tag: 'Lounge',
    place: 'West Hollywood',
    bg: '#451A03',
    accent: '#FDBA74',
    kind: 'bar',
  },
  'nightlife-roger-room': {
    title: 'The Roger Room',
    kicker: 'Cocktails',
    tag: 'Bar',
    place: 'West Hollywood',
    bg: '#172554',
    accent: '#EAB308',
    kind: 'bar',
  },
  'nightlife-mama-shelter': {
    title: 'Mama Shelter Rooftop',
    kicker: 'Rooftop',
    tag: 'Nightlife',
    place: 'Hollywood',
    bg: '#831843',
    accent: '#FB7185',
    kind: 'rooftop',
  },
  'nightlife-bar-lis': {
    title: 'Bar Lis',
    kicker: 'Rooftop',
    tag: 'Lounge',
    place: 'Hollywood',
    bg: '#312E81',
    accent: '#FDE68A',
    kind: 'rooftop',
  },
  'landmark-hollywood-sign': {
    title: 'Hollywood Sign',
    kicker: 'Landmark',
    tag: 'Photo Spot',
    place: 'Los Angeles',
    bg: '#064E3B',
    accent: '#F8FAFC',
    kind: 'hills',
  },
  'landmark-pyramids-giza': {
    title: 'Pyramids of Giza',
    kicker: 'Landmark',
    tag: 'Historic',
    place: 'Egypt',
    bg: '#92400E',
    accent: '#FDE68A',
    kind: 'pyramid',
  },
  'landmark-templo-mayor': {
    title: 'Templo Mayor',
    kicker: 'Landmark',
    tag: 'Historic',
    place: 'Mexico City',
    bg: '#7C2D12',
    accent: '#FDBA74',
    kind: 'ruins',
  },
  'landmark-eiffel-tower': {
    title: 'Eiffel Tower',
    kicker: 'Landmark',
    tag: 'Architecture',
    place: 'Paris',
    bg: '#1E3A8A',
    accent: '#FCD34D',
    kind: 'tower',
  },
  'landmark-sydney-opera-house': {
    title: 'Sydney Opera House',
    kicker: 'Landmark',
    tag: 'Architecture',
    place: 'Sydney',
    bg: '#0E7490',
    accent: '#E0F2FE',
    kind: 'harbor',
  },
};

const escapeSvgText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const getArtwork = (kind: RecommendationImageKind, accent: string) => {
  switch (kind) {
    case 'arena':
    case 'stadium':
      return `<ellipse cx="225" cy="214" rx="172" ry="48" fill="rgba(255,255,255,.12)" stroke="${accent}" stroke-width="5"/><rect x="86" y="128" width="278" height="96" rx="48" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.22)"/><circle cx="225" cy="176" r="30" fill="${accent}" opacity=".9"/>`;
    case 'ballpark':
      return `<path d="M94 232 Q225 118 356 232 Z" fill="rgba(34,197,94,.22)" stroke="${accent}" stroke-width="5"/><path d="M154 216 L225 156 L296 216" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="4"/><circle cx="225" cy="178" r="18" fill="${accent}"/>`;
    case 'campus':
    case 'pitch':
      return `<rect x="72" y="128" width="306" height="118" rx="26" fill="rgba(34,197,94,.18)" stroke="${accent}" stroke-width="5"/><line x1="225" y1="128" x2="225" y2="246" stroke="rgba(255,255,255,.45)" stroke-width="3"/><circle cx="225" cy="187" r="31" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3"/>`;
    case 'ice':
      return `<rect x="78" y="132" width="294" height="108" rx="44" fill="rgba(224,242,254,.18)" stroke="${accent}" stroke-width="5"/><line x1="225" y1="132" x2="225" y2="240" stroke="rgba(255,255,255,.5)" stroke-width="3"/><circle cx="225" cy="186" r="19" fill="${accent}"/>`;
    case 'bar':
    case 'club':
    case 'lounge':
    case 'rooftop':
      return `<path d="M68 232 H382 V178 C336 152 300 138 253 158 C210 176 176 144 132 164 C98 180 80 204 68 232Z" fill="rgba(0,0,0,.32)"/><rect x="82" y="122" width="56" height="110" rx="6" fill="rgba(255,255,255,.12)"/><rect x="156" y="92" width="72" height="140" rx="8" fill="rgba(255,255,255,.16)"/><rect x="250" y="114" width="92" height="118" rx="8" fill="rgba(255,255,255,.13)"/><circle cx="332" cy="88" r="30" fill="${accent}" opacity=".85"/>`;
    case 'hills':
      return `<path d="M0 244 C86 148 148 191 219 126 C285 66 348 148 450 84 V300 H0Z" fill="rgba(34,197,94,.24)"/><text x="225" y="148" text-anchor="middle" font-size="30" font-family="Inter,Arial" font-weight="900" fill="${accent}" letter-spacing="3">HOLLYWOOD</text>`;
    case 'pyramid':
      return `<path d="M83 238 L190 86 L286 238 Z" fill="rgba(253,230,138,.5)" stroke="${accent}" stroke-width="5"/><path d="M184 238 L292 116 L372 238 Z" fill="rgba(251,191,36,.3)" stroke="${accent}" stroke-width="4"/>`;
    case 'ruins':
      return `<path d="M92 232 H358 L326 190 H124 Z" fill="rgba(251,146,60,.28)" stroke="${accent}" stroke-width="5"/><path d="M132 190 H318 L288 152 H162 Z M178 152 H272 L252 116 H198 Z" fill="rgba(251,146,60,.38)" stroke="${accent}" stroke-width="4"/>`;
    case 'tower':
      return `<path d="M225 58 C210 120 196 178 164 246 H286 C254 178 240 120 225 58Z" fill="rgba(252,211,77,.26)" stroke="${accent}" stroke-width="5"/><line x1="196" y1="142" x2="254" y2="142" stroke="${accent}" stroke-width="4"/><line x1="181" y1="198" x2="269" y2="198" stroke="${accent}" stroke-width="4"/>`;
    case 'harbor':
      return `<path d="M78 222 C140 142 178 92 222 198 C260 88 308 142 374 222 Z" fill="rgba(224,242,254,.42)" stroke="${accent}" stroke-width="5"/><path d="M0 236 C80 220 152 250 232 232 C310 216 374 230 450 214 V300 H0Z" fill="rgba(14,116,144,.35)"/>`;
  }
};

const buildRecommendationImage = ({
  title,
  kicker,
  tag,
  place,
  bg,
  accent,
  kind,
}: RecommendationImageConfig) => {
  const safeTitle = escapeSvgText(title);
  const safeKicker = escapeSvgText(kicker);
  const safeTag = escapeSvgText(tag);
  const safePlace = escapeSvgText(place);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 450 300" role="img" aria-label="${safeTitle} mock recommendation image"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset=".55" stop-color="#111827"/><stop offset="1" stop-color="#020617"/></linearGradient><radialGradient id="glow" cx="75%" cy="20%" r="65%"><stop offset="0" stop-color="${accent}" stop-opacity=".58"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="450" height="300" fill="url(#g)"/><rect width="450" height="300" fill="url(#glow)"/><g opacity=".36"><circle cx="70" cy="58" r="2" fill="#fff"/><circle cx="120" cy="38" r="1.5" fill="#fff"/><circle cx="386" cy="62" r="2" fill="#fff"/><circle cx="335" cy="36" r="1.4" fill="#fff"/></g>${getArtwork(kind, accent)}<rect x="22" y="24" width="118" height="28" rx="14" fill="rgba(0,0,0,.42)" stroke="${accent}"/><text x="81" y="43" text-anchor="middle" font-size="13" font-family="Inter,Arial" font-weight="800" fill="${accent}">${safeKicker}</text><text x="28" y="265" font-size="24" font-family="Inter,Arial" font-weight="900" fill="#fff">${safeTitle}</text><text x="29" y="285" font-size="13" font-family="Inter,Arial" font-weight="700" fill="rgba(255,255,255,.72)">${safeTag} • ${safePlace}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Realistic photo overrides for the formerly placeholder-illustration categories
// (Sports, Nightlife, Landmarks). Falls back to the SVG mock if no real asset
// is mapped for a key — keeping the build resilient to new keys.
import sportsLakers from '@/assets/recommendations/sports-lakers.jpg';
import sportsClippers from '@/assets/recommendations/sports-clippers.jpg';
import sportsRams from '@/assets/recommendations/sports-rams.jpg';
import sportsChargers from '@/assets/recommendations/sports-chargers.jpg';
import sportsDodgers from '@/assets/recommendations/sports-dodgers.jpg';
import sportsAngels from '@/assets/recommendations/sports-angels.jpg';
import sportsKings from '@/assets/recommendations/sports-kings.jpg';
import sportsLafc from '@/assets/recommendations/sports-lafc.jpg';
import sportsGalaxy from '@/assets/recommendations/sports-galaxy.jpg';
import sportsUsc from '@/assets/recommendations/sports-usc.jpg';
import sportsUcla from '@/assets/recommendations/sports-ucla.jpg';
import nlHighlightRoom from '@/assets/recommendations/nightlife-highlight-room.jpg';
import nlAcademyLa from '@/assets/recommendations/nightlife-academy-la.jpg';
import nlSoundNightclub from '@/assets/recommendations/nightlife-sound-nightclub.jpg';
import nlExchangeLa from '@/assets/recommendations/nightlife-exchange-la.jpg';
import nlWarwick from '@/assets/recommendations/nightlife-warwick.jpg';
import nlEpLp from '@/assets/recommendations/nightlife-ep-lp.jpg';
import nlEmployeesOnly from '@/assets/recommendations/nightlife-employees-only.jpg';
import nlRogerRoom from '@/assets/recommendations/nightlife-roger-room.jpg';
import nlMamaShelter from '@/assets/recommendations/nightlife-mama-shelter.jpg';
import nlBarLis from '@/assets/recommendations/nightlife-bar-lis.jpg';
import landmarkHollywoodSign from '@/assets/recommendations/landmark-hollywood-sign.jpg';
import landmarkPyramidsGiza from '@/assets/recommendations/landmark-pyramids-giza.jpg';
import landmarkTemploMayor from '@/assets/recommendations/landmark-templo-mayor.jpg';
import landmarkEiffelTower from '@/assets/recommendations/landmark-eiffel-tower.jpg';
import landmarkSydneyOperaHouse from '@/assets/recommendations/landmark-sydney-opera-house.jpg';

const realImageOverrides: Partial<Record<RecommendationImageKey, string>> = {
  'sports-lakers': sportsLakers,
  'sports-clippers': sportsClippers,
  'sports-rams': sportsRams,
  'sports-chargers': sportsChargers,
  'sports-dodgers': sportsDodgers,
  'sports-angels': sportsAngels,
  'sports-kings': sportsKings,
  'sports-lafc': sportsLafc,
  'sports-galaxy': sportsGalaxy,
  'sports-usc': sportsUsc,
  'sports-ucla': sportsUcla,
  'nightlife-highlight-room': nlHighlightRoom,
  'nightlife-academy-la': nlAcademyLa,
  'nightlife-sound-nightclub': nlSoundNightclub,
  'nightlife-exchange-la': nlExchangeLa,
  'nightlife-warwick': nlWarwick,
  'nightlife-ep-lp': nlEpLp,
  'nightlife-employees-only': nlEmployeesOnly,
  'nightlife-roger-room': nlRogerRoom,
  'nightlife-mama-shelter': nlMamaShelter,
  'nightlife-bar-lis': nlBarLis,
  'landmark-hollywood-sign': landmarkHollywoodSign,
  'landmark-pyramids-giza': landmarkPyramidsGiza,
  'landmark-templo-mayor': landmarkTemploMayor,
  'landmark-eiffel-tower': landmarkEiffelTower,
  'landmark-sydney-opera-house': landmarkSydneyOperaHouse,
};

export const getRecommendationImage = (key: RecommendationImageKey) =>
  realImageOverrides[key] ?? buildRecommendationImage(imageConfigs[key]);
