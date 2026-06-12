/**
 * Canonical super-admin email bypass list for edge functions.
 *
 * SECURITY: Founder emails are NOT hardcoded here — they live in the
 * `public.super_admins` database table (server-enforced) and/or the
 * `SUPER_ADMIN_EMAILS` Supabase secret (env-enforced). This module only
 * resolves env-configured emails; database-backed checks should use the
 * `public.is_super_admin()` SQL function inside RLS policies.
 *
 * Demo bypass (`demo@chravelapp.com`) is opt-in:
 *   - SUPER_ADMIN_ENABLE_DEMO_EMAIL=true
 *   - or include in SUPER_ADMIN_EMAILS
 */
export const FOUNDER_SUPER_ADMIN_EMAILS: readonly string[] = [];

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const parseCsvEmails = (value: string | undefined): string[] =>
  (value || '').split(',').map(normalizeEmail).filter(Boolean);

const demoBypassEnabled = (value: string | undefined): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

export const getSuperAdminEmails = (env: Pick<typeof Deno.env, 'get'> = Deno.env): Set<string> => {
  const envAdmins = parseCsvEmails(env.get('SUPER_ADMIN_EMAILS'));
  const includeDemo = demoBypassEnabled(env.get('SUPER_ADMIN_ENABLE_DEMO_EMAIL'));

  return new Set([
    ...FOUNDER_SUPER_ADMIN_EMAILS.map(normalizeEmail),
    ...(includeDemo ? ['demo@chravelapp.com'] : []),
    ...envAdmins,
  ]);
};

export const isSuperAdminEmail = (
  email: string | null | undefined,
  env: Pick<typeof Deno.env, 'get'> = Deno.env,
): boolean => {
  if (!email) return false;
  return getSuperAdminEmails(env).has(normalizeEmail(email));
};
