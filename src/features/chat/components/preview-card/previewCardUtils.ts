import type { SmartImportPreviewEvent } from '@/services/conciergeGateway';
import { CalendarPlus, Plane, Hotel, UtensilsCrossed, Music, MapPin } from 'lucide-react';
import type React from 'react';

export const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; color: string }
> = {
  transportation: { icon: Plane, label: 'Transportation', color: 'sky' },
  lodging: { icon: Hotel, label: 'Lodging', color: 'amber' },
  dining: { icon: UtensilsCrossed, label: 'Dining', color: 'orange' },
  activity: { icon: MapPin, label: 'Activity', color: 'green' },
  entertainment: { icon: Music, label: 'Entertainment', color: 'purple' },
  other: { icon: CalendarPlus, label: 'Event', color: 'blue' },
};

export const COLOR_CLASSES: Record<string, string> = {
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  orange: 'text-orange-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  blue: 'text-blue-400',
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Derive a stable key for an event. Uses `event.id` when present (delete mode),
 * otherwise derives from content fields (import mode where events have no DB ID yet).
 */
export function getEventKey(event: SmartImportPreviewEvent): string {
  if (event.id) return event.id;
  return `${event.title}|${event.startTime}|${event.location || ''}|${event.category}`;
}

export type PreviewMode = 'import' | 'delete';

export interface PreviewModeConfig {
  accentBorder: string;
  accentBg: string;
  accentText: string;
  headerTitle: string;
  confirmLabel: string;
  confirmingLabel: string;
  confirmBg: string;
  confirmHoverBg: string;
  successBorder: string;
  successBg: string;
  successText: string;
  successLabel: string;
  errorLabel: string;
  checkboxAccent: string;
}

export const MODE_CONFIG: Record<PreviewMode, PreviewModeConfig> = {
  import: {
    accentBorder: 'border-blue-500/30',
    accentBg: 'bg-blue-500/5',
    accentText: 'text-blue-300',
    headerTitle: 'Smart Import Preview',
    confirmLabel: 'Add to Calendar',
    confirmingLabel: 'Importing...',
    confirmBg: 'bg-primary',
    confirmHoverBg: 'hover:bg-primary/90',
    successBorder: 'border-green-500/30',
    successBg: 'bg-green-500/10',
    successText: 'text-green-300',
    successLabel: 'Added',
    errorLabel: 'Import failed',
    checkboxAccent: 'accent-blue-500',
  },
  delete: {
    accentBorder: 'border-red-500/30',
    accentBg: 'bg-red-500/5',
    accentText: 'text-red-300',
    headerTitle: 'Events to Remove',
    confirmLabel: 'Remove from Calendar',
    confirmingLabel: 'Removing...',
    confirmBg: 'bg-red-600',
    confirmHoverBg: 'hover:bg-red-500',
    successBorder: 'border-green-500/30',
    successBg: 'bg-green-500/10',
    successText: 'text-green-300',
    successLabel: 'Removed',
    errorLabel: 'Removal failed',
    checkboxAccent: 'accent-red-500',
  },
};
