import type { ExportLayout, ExportSection } from './types.ts';

export interface TripExportMembershipRow {
  user_id: string;
  role?: string | null;
}

export const PRO_TRIP_DEFAULT_EXPORT_SECTIONS: ExportSection[] = [
  'calendar',
  'payments',
  'places',
  'tasks',
  'polls',
  'roster',
  'broadcasts',
  'attachments',
];

export const CONSUMER_TRIP_DEFAULT_EXPORT_SECTIONS: ExportSection[] = [
  'calendar',
  'payments',
  'places',
  'tasks',
  'polls',
];

export const resolveDefaultTripExportSections = (layout: ExportLayout): ExportSection[] =>
  layout === 'pro'
    ? [...PRO_TRIP_DEFAULT_EXPORT_SECTIONS]
    : [...CONSUMER_TRIP_DEFAULT_EXPORT_SECTIONS];

export const canExportTripPdf = ({
  userId,
  membership,
}: {
  userId: string | null | undefined;
  membership: TripExportMembershipRow | null | undefined;
}): boolean => Boolean(userId && membership?.user_id === userId);
