import {
  Users,
  Calendar as CalendarIcon,
  DollarSign,
  ClipboardList,
  BarChart3,
  Camera,
  Headset,
  MapPin,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { ProTripCategory, getCategoryConfig } from '../../types/proCategories';

export interface ProTab {
  id: string;
  label: string;
  icon: LucideIcon | null;
  proOnly?: boolean;
  restrictedRoles?: string[];
  requiredPermissions?: string[];
}

// 🆕 Updated tab order: Chat, Calendar, Concierge, Media, Payments, Places, Polls, Tasks, Team
export const proTabs: ProTab[] = [
  { id: 'chat', label: 'Chat', icon: null },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'ai-chat', label: 'Concierge', icon: Headset },
  { id: 'media', label: 'Media', icon: Camera },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'places', label: 'Places', icon: MapPin },
  { id: 'polls', label: 'Polls', icon: BarChart3 },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'team', label: 'Team', icon: Users, proOnly: true, requiredPermissions: ['read'] },
];

/**
 * Pro tab ids whose content is still a static placeholder empty state
 * (see the `finance` / `medical` / `compliance` / `sponsors` cases in
 * ProTabContent.tsx) AND whose backing data `convertSupabaseTripToProTrip`
 * hardcodes to empty for every real Supabase trip (settlement/perDiem,
 * medical, compliance, sponsors — src/utils/tripConverter.ts).
 *
 * These tabs must never be offered on a real (non-demo) trip — advertising a
 * paid surface that renders an empty placeholder destroys trust. Demo trips
 * may surface them: the demo is the product vision.
 *
 * The gate is the app-wide demo/real distinction (`useDemoMode`), never a
 * hardcoded mock trip id.
 */
export const PLACEHOLDER_PRO_TAB_IDS: readonly string[] = [
  'finance',
  'medical',
  'compliance',
  'sponsors',
];

export interface ProTabVisibilityOptions {
  /**
   * True only when the trip is a demo trip (from `useDemoMode().isDemoMode`).
   * Defaults to false so the safe path (hide placeholders) is the default.
   */
  isDemoTrip?: boolean;
}

/** Removes placeholder-backed tabs on real trips; demo trips keep everything. */
export const filterPlaceholderTabs = (tabs: ProTab[], isDemoTrip: boolean): ProTab[] =>
  isDemoTrip ? tabs : tabs.filter(tab => !PLACEHOLDER_PRO_TAB_IDS.includes(tab.id));

export const getVisibleTabs = (
  userRole: string,
  userPermissions: string[],
  category?: ProTripCategory,
  options: ProTabVisibilityOptions = {},
): ProTab[] => {
  const isDemoTrip = options.isDemoTrip ?? false;
  let availableTabs = filterPlaceholderTabs(proTabs, isDemoTrip);

  // Filter tabs based on category if provided
  if (category) {
    const categoryConfig = getCategoryConfig(category);

    // Defensive check: if category is invalid, log error and show all tabs
    if (!categoryConfig) {
      if (import.meta.env.DEV)
        console.error(`Invalid ProTripCategory: "${category}". Showing all tabs.`);
      return filterPlaceholderTabs(proTabs, isDemoTrip);
    }

    // 🆕 Media and Payments are now always available for enterprise trips
    availableTabs = filterPlaceholderTabs(proTabs, isDemoTrip).filter(
      tab =>
        !tab.proOnly ||
        categoryConfig.availableTabs.includes(tab.id) ||
        ['chat', 'places', 'ai-chat', 'media', 'payments'].includes(tab.id),
    );
  }

  return availableTabs.filter(tab => {
    // Check role-based restrictions
    if (tab.restrictedRoles && tab.restrictedRoles.includes(userRole.toLowerCase())) {
      return false;
    }

    // Check permission requirements
    if (tab.requiredPermissions && tab.requiredPermissions.length > 0) {
      const hasRequiredPermission = tab.requiredPermissions.some(permission =>
        userPermissions.includes(permission),
      );
      if (!hasRequiredPermission) {
        return false;
      }
    }

    return true;
  });
};

export const isReadOnlyTab = (
  tabId: string,
  userRole: string,
  userPermissions: string[],
  isDemoMode?: boolean,
): boolean => {
  // Demo mode overrides all read-only restrictions
  if (isDemoMode) return false;

  // Finance and compliance tabs are read-only for certain roles.
  // 'player' included so the Sports category roster roles are covered too.
  if (
    (tabId === 'finance' || tabId === 'compliance') &&
    ['talent', 'cast', 'student', 'artist', 'player'].includes(userRole.toLowerCase())
  ) {
    return true;
  }

  // Check if user has write permissions
  if (!userPermissions.includes('write') && !userPermissions.includes('admin')) {
    return true;
  }

  return false;
};

export const hasTabAccess = (
  tabId: string,
  userRole: string,
  userPermissions: string[],
): boolean => {
  const tab = proTabs.find(t => t.id === tabId);
  if (!tab) return false;

  // Check role restrictions
  if (tab.restrictedRoles && tab.restrictedRoles.includes(userRole.toLowerCase())) {
    return false;
  }

  // Check permission requirements
  if (tab.requiredPermissions && tab.requiredPermissions.length > 0) {
    return tab.requiredPermissions.some(permission => userPermissions.includes(permission));
  }

  return true;
};
