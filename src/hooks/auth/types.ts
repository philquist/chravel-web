import { Session } from '@supabase/supabase-js';

/** Shape of the `public.profiles` row consumed by the auth layer. */
export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  real_name: string | null;
  name_preference: 'real' | 'display' | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  show_email: boolean;
  show_phone: boolean;
  job_title?: string | null;
  show_job_title?: boolean;
}

export type ProRole =
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

/** Application-level user identity derived from Supabase auth + profile rows. */
export interface AuthUser {
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
  // Enhanced pro role system
  proRole?: ProRole;
  organizationId?: string;
  permissions: string[];
  /** @deprecated Use useNotificationPreferences hook for notification preference reads/writes. */
  notificationSettings: {
    messages: boolean | null;
    broadcasts: boolean | null;
    tripUpdates: boolean | null;
    email: boolean | null;
    push: boolean | null;
  };
}

export type AuthStateValue = 'unauthenticated' | 'loading' | 'authenticated' | 'error';

export interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: (returnToOverride?: string) => Promise<{ error?: string }>;
  signInWithApple: (returnToOverride?: string) => Promise<{ error?: string }>;
  signInWithPhone: (phone: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    returnToOverride?: string,
  ) => Promise<{ error?: string; success?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase error type is loosely typed
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: any }>;
  /** @deprecated Use useNotificationPreferences hook for notification preference reads/writes. */
  updateNotificationSettings: (updates: Partial<AuthUser['notificationSettings']>) => Promise<void>;
  switchRole: (role: string) => void;
  authState: AuthStateValue;
  authErrorReason: string | null;
  isAuthenticated: boolean;
  /**
   * True once the initial session bootstrap has settled (success, signed-out, or error).
   * Downstream data fetches gated on auth should wait for this to avoid Trip-Not-Found
   * flashes during the hydration race.
   */
  isHydrated: boolean;
}
