import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  Camera,
  CreditCard,
  Headphones,
  ListChecks,
  MapPin,
  MessageCircle,
} from 'lucide-react';

export interface AppItem {
  name: string;
  androidInstalls?: string;
  iosRatings?: string;
  globalUsers?: string;
  source?: string;
}

export interface Category {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  benefit: string;
  benefitQuote?: string;
  hero: AppItem[];
  full: AppItem[];
}

export const CATEGORIES: Category[] = [
  {
    key: 'chat',
    title: 'Chat',
    subtitle: '',
    icon: MessageCircle,
    benefit: 'A private group chat built specifically for your trip.',
    hero: [
      { name: 'WhatsApp' },
      { name: 'iMessage/SMS' },
      { name: 'Facebook Messenger' },
      { name: 'Instagram DMs' },
      { name: 'GroupMe' },
      { name: 'Snapchat' },
      { name: 'Telegram' },
      { name: 'Discord' },
    ],
    full: [{ name: 'Slack' }, { name: 'Microsoft Teams' }],
  },

  {
    key: 'calendar',
    title: 'Calendar',
    subtitle: '',
    icon: CalendarDays,
    benefit: 'One shared schedule — updated live for everyone.',
    hero: [
      { name: 'Google Calendar' },
      { name: 'Apple Calendar' },
      { name: 'Outlook Calendar' },
      { name: 'Gmail' },
      { name: 'Outlook Email' },
      { name: 'Calendly' },
      { name: 'iCal' },
    ],
    full: [],
  },

  {
    key: 'concierge',
    title: 'Concierge',
    subtitle: '',
    icon: Headphones,
    benefit: 'Your AI concierge — aware of your trip, preferences, and context.',
    hero: [
      { name: 'ChatGPT' },
      { name: 'Google Search' },
      { name: 'Gemini' },
      { name: 'Claude' },
      { name: 'Perplexity' },
      { name: 'Reddit' },
      { name: 'TikTok' },
      { name: 'Instagram' },
    ],
    full: [{ name: 'YouTube' }, { name: 'Tripadvisor' }, { name: 'Yelp' }],
  },

  {
    key: 'media',
    title: 'Media',
    subtitle: '',
    icon: Camera,
    benefit: 'Photos, videos, files, and confirmations — one hub for the whole group.',
    hero: [
      { name: 'Google Photos' },
      { name: 'Apple Photos' },
      { name: 'iCloud' },
      { name: 'Google Drive' },
      { name: 'Dropbox' },
      { name: 'Instagram' },
      { name: 'Snapchat Memories' },
      { name: 'WhatsApp Photos' },
    ],
    full: [{ name: 'WeTransfer' }, { name: 'OneDrive' }, { name: 'Box' }],
  },

  {
    key: 'payments',
    title: 'Payments',
    subtitle: '',
    icon: CreditCard,
    benefit: 'See who paid, who owes, and how everyone prefers to settle.',
    hero: [
      { name: 'Venmo' },
      { name: 'Zelle' },
      { name: 'PayPal' },
      { name: 'Cash App' },
      { name: 'Splitwise' },
      { name: 'Apple Cash' },
      { name: 'Google Sheets' },
      { name: 'Excel' },
    ],
    full: [],
  },

  {
    key: 'places',
    title: 'Places',
    subtitle: '',
    icon: MapPin,
    benefit: 'Links, reservations, and locations saved once — found instantly.',
    hero: [
      { name: 'Google Maps' },
      { name: 'Apple Maps' },
      { name: 'Waze' },
      { name: 'Yelp' },
      { name: 'Tripadvisor' },
      { name: 'OpenTable' },
      { name: 'Resy' },
      { name: 'Airbnb' },
    ],
    full: [
      { name: 'Booking.com' },
      { name: 'Vrbo' },
      { name: 'Apple Notes' },
      { name: 'Safari / Chrome Bookmarks' },
    ],
  },

  {
    key: 'polls',
    title: 'Polls',
    subtitle: '',
    icon: BarChart3,
    benefit: 'Make group decisions without endless debates or scrolling for buried votes.',
    hero: [
      { name: 'Doodle' },
      { name: 'Google Forms' },
      { name: 'SurveyMonkey' },
      { name: 'When2Meet' },
      { name: 'Typeform' },
      { name: 'StrawPoll' },
      { name: 'WhatsApp Polls' },
    ],
    full: [],
  },

  {
    key: 'tasks',
    title: 'Tasks',
    subtitle: '',
    icon: ListChecks,
    benefit: 'The group to-do list — reminders and accountability for everyone.',
    hero: [
      { name: 'Apple Reminders' },
      { name: 'Google Tasks' },
      { name: 'Todoist' },
      { name: 'Google Keep' },
      { name: 'Apple Notes' },
      { name: 'Trello' },
    ],
    full: [
      { name: 'Notion' },
      { name: 'Asana' },
      { name: 'Monday.com' },
      { name: 'Microsoft To Do' },
    ],
  },
];
