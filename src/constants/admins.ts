// Super admin detection is enforced server-side via the `is_super_admin()` SQL
// function and the `public.super_admins` table. Real founder emails are NOT
// shipped in the client bundle — that would leak admin PII to any visitor who
// inspects the JS.
//
// For optional client-side UI hints (e.g. showing an admin badge), an opt-in
// allowlist may be provided via VITE_SUPER_ADMIN_EMAILS (comma-separated).
// Leaving it unset means the client treats no one as a super admin; all real
// privilege grants happen server-side via RLS.

const envAdmins = (import.meta.env.VITE_SUPER_ADMIN_EMAILS as string) || '';
const envAdminList = envAdmins
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export const SUPER_ADMIN_EMAILS: string[] = [...new Set(envAdminList)];
