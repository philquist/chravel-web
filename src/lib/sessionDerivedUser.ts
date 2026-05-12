import type { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Minimal `User` shape for cold-start hydration from JWT/session only.
 * Full profile, roles, and notification prefs load in the background via `transformUser`.
 */
export type SessionDerivedAppUser = {
  id: string;
  email?: string;
  phone?: string;
  displayName: string;
  realName?: string;
  namePreference: 'real' | 'display';
  hasCompletedProfileSetup: boolean;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  isPro: boolean;
  showEmail: boolean;
  showPhone: boolean;
  jobTitle?: string;
  showJobTitle?: boolean;
  proRole?:
    | 'admin'
    | 'staff'
    | 'talent'
    | 'player'
    | 'crew'
    | 'security'
    | 'medical'
    | 'producer'
    | 'speakers'
    | 'guests'
    | 'coordinators'
    | 'logistics'
    | 'press';
  organizationId?: string;
  permissions: string[];
  notificationSettings: {
    messages: boolean | null;
    broadcasts: boolean | null;
    tripUpdates: boolean | null;
    email: boolean | null;
    push: boolean | null;
  };
};

/**
 * Build a conservative in-app user from Supabase Auth user metadata only.
 * Avoids blocking the shell on profiles / user_roles / org / notification_preferences.
 */
export function buildSessionDerivedUser(supabaseUser: SupabaseUser): SessionDerivedAppUser {
  const meta = supabaseUser.user_metadata ?? {};
  const displayName =
    (meta.display_name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    supabaseUser.email?.split('@')[0] ||
    'User';

  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    phone: supabaseUser.phone,
    displayName,
    realName: undefined,
    namePreference: 'display',
    hasCompletedProfileSetup: displayName.trim().length > 0 && displayName !== 'User',
    firstName: '',
    lastName: '',
    avatar: '',
    bio: '',
    isPro: false,
    showEmail: false,
    showPhone: false,
    jobTitle: undefined,
    showJobTitle: false,
    proRole: undefined,
    organizationId: undefined,
    permissions: ['read'],
    notificationSettings: {
      messages: null,
      broadcasts: null,
      tripUpdates: null,
      email: null,
      push: null,
    },
  };
}
