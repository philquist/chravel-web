// Prices derive from billing/config.ts (the single numeric source of truth).
// Do not hardcode dollar amounts in this file.
import { BILLING_PRODUCTS, TRIP_PASS_PRODUCTS } from '@/billing/config';

export interface ConsumerSubscription {
  tier:
    | 'free'
    | 'explorer'
    | 'frequent-chraveler'
    | 'pro-starter'
    | 'pro-growth'
    | 'pro-enterprise';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  storageUsedMB?: number;
  storageQuotaMB?: number;
}

export interface StorageQuota {
  usedMB: number;
  quotaMB: number;
  percentUsed: number;
  isNearLimit: boolean; // 80%+
  isOverLimit: boolean;
}

export interface TripPreferences {
  dietary: string[];
  vibe: string[];
  accessibility: string[];
  business: string[];
  entertainment: string[];
  lifestyle: string[];
  budgetMin: number;
  budgetMax: number;
  budgetUnit: 'experience' | 'day' | 'person' | 'trip';
  timePreference: 'early-riser' | 'night-owl' | 'flexible';
}

export const BUDGET_UNIT_OPTIONS = [
  { value: 'experience', label: 'Per experience' },
  { value: 'day', label: 'Per day' },
  { value: 'person', label: 'Per person' },
  { value: 'trip', label: 'Per trip' },
] as const;

export interface TripCategory {
  id: string;
  label: string;
  color: string;
}

export const CONSUMER_TRIP_CATEGORIES: TripCategory[] = [
  { id: 'work', label: 'Work', color: 'blue' },
  { id: 'leisure', label: 'Leisure', color: 'green' },
  { id: 'family', label: 'Family', color: 'purple' },
  { id: 'music', label: 'Music', color: 'pink' },
  { id: 'sports', label: 'Sports', color: 'orange' },
  { id: 'vacation', label: 'Vacation', color: 'teal' },
  { id: 'foodie', label: 'Foodie', color: 'yellow' },
  { id: 'adventure', label: 'Adventure', color: 'red' },
  { id: 'wellness', label: 'Wellness', color: 'emerald' },
  { id: 'cultural', label: 'Cultural', color: 'indigo' },
  { id: 'romantic', label: 'Romantic', color: 'rose' },
  { id: 'bachelor-bachelorette', label: 'Bachelor/Bachelorette', color: 'fuchsia' },
  { id: 'reunion', label: 'Reunion', color: 'cyan' },
  { id: 'shopping', label: 'Shopping', color: 'violet' },
  { id: 'nightlife', label: 'Nightlife', color: 'amber' },
];

/**
 * Pro trip categories for UI display.
 *
 * IMPORTANT: IDs here must match ProCategoryEnum values in proCategories.ts.
 * The previous version used kebab-case IDs (business-travel, school-trip, etc.)
 * which did NOT match ProCategoryEnum and caused silent lookup failures.
 */
export const PRO_TRIP_CATEGORIES: TripCategory[] = [
  { id: 'work', label: 'Business Travel', color: 'slate' },
  { id: 'school', label: 'School Trip', color: 'sky' },
  { id: 'productions', label: 'Content / Productions', color: 'lime' },
  { id: 'touring', label: 'Tour', color: 'coral' },
  { id: 'sports', label: 'Sports (Pro/Collegiate)', color: 'orange' },
  { id: 'celebrations', label: 'Celebrations', color: 'fuchsia' },
  { id: 'other', label: 'Other', color: 'gray' },
];

export interface AIRecommendation {
  id: string;
  type: 'restaurant' | 'activity' | 'accommodation' | 'transportation';
  title: string;
  description: string;
  location: string;
  rating?: number;
  priceRange?: string;
  matchedPreferences: string[];
}

export const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Halal',
  'Kosher',
  'Gluten-free',
  'Dairy-free',
  'Nut-free',
  'Pescatarian',
  'Keto',
  'No restrictions',
];

export const VIBE_OPTIONS = [
  'Chill',
  'Party',
  'Outdoorsy',
  'Family-friendly',
  'Romantic',
  'Adventure',
  'Cultural',
  'Luxury',
  'Budget-friendly',
  'Nightlife',
  'High Energy',
  'Cozy',
  'Date Night',
  'Good for Groups',
];

export const ACCESSIBILITY_OPTIONS = [
  'Differently Abled Accessible',
  'EV Charging Nearby',
  'Pet Friendly',
  'Family Friendly',
  'Women Owned',
  'LGBTQ+ Friendly',
];

export const BUSINESS_OPTIONS = [
  'Business Appropriate',
  'Corporate',
  'Formal',
  'Chains',
  'Franchises',
];

export const ENTERTAINMENT_OPTIONS = [
  'Live Music',
  'Comedy',
  'Theater',
  'Sports',
  'Art',
  'Historic',
  'Shopping',
  'Tourist Attraction',
  'Landmark',
  'Must-See',
];

export const LIFESTYLE_OPTIONS = [
  'After Hours',
  'Late Night',
  'Early Morning Risers',
  'Locally Owned',
  'Black Owned',
  'Cannabis Friendly',
  'Casual',
  'Fine Dining',
  'Healthy Eats',
  'Brunch',
  'Lounges',
  'Outdoors',
  'Physical Adventure',
  'Sightseeing',
  'Volunteering',
  'Night Owls',
  "Farmer's Markets",
];

/**
 * Consumer subscription pricing
 *
 * PRIMARY consumer offering: Trip Passes ($39.99/45d, $74.99/90d)
 * Subscriptions exist for recurring travelers ($9.99/mo, $19.99/mo)
 */
const _explorer = BILLING_PRODUCTS['consumer-explorer'];
const _frequent = BILLING_PRODUCTS['consumer-frequent-chraveler'];
const _annualSavings = (monthly: number, annual: number) => Math.floor(monthly * 12 - annual);
const _annualSavingsPct = (monthly: number, annual: number) =>
  Math.round((1 - annual / (monthly * 12)) * 100);

const _explorerAnnual = _explorer.priceAnnual ?? _explorer.priceMonthly * 12;
const _frequentAnnual = _frequent.priceAnnual ?? _frequent.priceMonthly * 12;

export const CONSUMER_PRICING = {
  explorer: {
    monthly: _explorer.priceMonthly,
    annual: _explorerAnnual,
    tripPass: TRIP_PASS_PRODUCTS['pass-explorer-45'].price,
    tripPassDays: TRIP_PASS_PRODUCTS['pass-explorer-45'].durationDays,
    trips: Infinity,
    aiQueries: 25, // 25 queries per trip
    savings: _annualSavings(_explorer.priceMonthly, _explorerAnnual),
    savingsPercent: _annualSavingsPct(_explorer.priceMonthly, _explorerAnnual),
  },
  'frequent-chraveler': {
    monthly: _frequent.priceMonthly,
    annual: _frequentAnnual,
    tripPass: TRIP_PASS_PRODUCTS['pass-frequent-90'].price,
    tripPassDays: TRIP_PASS_PRODUCTS['pass-frequent-90'].durationDays,
    trips: Infinity,
    aiQueries: Infinity, // Unlimited AI
    proTripsPerMonth: 1,
    proTripSeats: 50,
    savings: _annualSavings(_frequent.priceMonthly, _frequentAnnual),
    savingsPercent: _annualSavingsPct(_frequent.priceMonthly, _frequentAnnual),
  },
} as const;

// Legacy exports for backward compatibility (map to Explorer)
export const TRIPS_PLUS_PRICE = CONSUMER_PRICING.explorer.monthly;
export const TRIPS_PLUS_ANNUAL_PRICE = CONSUMER_PRICING.explorer.annual;

// Storage quotas (in MB)
export const FREE_STORAGE_QUOTA_MB = 500;
export const PLUS_STORAGE_QUOTA_MB = 50000; // 50GB

// Feature availability
export const FEATURE_ACCESS = {
  AI_CONCIERGE: 'free', // 10 queries per trip
  AI_QUERIES_EXPLORER: 25, // 25 queries per trip
  AI_QUERIES_UNLIMITED: 'frequent-chraveler',
  UNLIMITED_STORAGE: 'explorer', // Both paid tiers
  CALENDAR_SYNC: 'frequent-chraveler',
  PDF_EXPORT: 'frequent-chraveler',
  TRIP_CATEGORIES: 'explorer', // Both paid tiers can tag
  PRO_TRIP_ACCESS: 'frequent-chraveler', // 1 Pro trip/month
  PRIORITY_SUPPORT: 'explorer',
  EARLY_ACCESS: 'frequent-chraveler',
} as const;
