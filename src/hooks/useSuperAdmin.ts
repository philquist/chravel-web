import { useAuth } from './useAuth';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SUPER_ADMIN_EMAILS } from '../constants/admins';
import { supabase } from '../integrations/supabase/client';

// Export for backward compatibility if needed, but better to use from constants
export { SUPER_ADMIN_EMAILS } from '../constants/admins';

export const useSuperAdmin = () => {
  const { user } = useAuth();

  // Synchronous env-allowlist match (kept for fast UI hints / no-flicker badges).
  const envMatch = useMemo(() => {
    if (!user?.email) return false;
    return SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
  }, [user?.email]);

  // Server-side source of truth: public.is_super_admin() RPC, backed by the
  // public.super_admins table. We avoid shipping founder emails in the JS
  // bundle but still need to show admin-only UI (e.g. Chravel Recs) for real
  // super admins. Cached per session via TanStack Query.
  const { data: serverMatch } = useQuery({
    queryKey: ['is-super-admin', user?.id ?? null],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_super_admin');
      if (error) {
        // Non-fatal: fall back to env allowlist only.
        return false;
      }
      return Boolean(data);
    },
    enabled: Boolean(user?.id),
    // Always re-verify on app launch so PWA/mobile caches can't hide admin-only
    // surfaces (e.g. Chravel Recs) after a permission change on the server.
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: true,
  });

  return { isSuperAdmin: envMatch || Boolean(serverMatch) };
};

// Standalone check function for non-hook contexts (env-only; sync).
export const checkIsSuperAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase().trim());
};
