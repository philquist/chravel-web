# Super-Admin Bootstrap

Chravel super-admin identity is server-enforced by `public.is_super_admin()`,
which reads exclusively from the `public.super_admins` table. **No email
addresses live in the codebase.**

## Sources of truth

| Layer | Source | Notes |
|---|---|---|
| Runtime authorization | `public.super_admins` (Postgres table) | Only source RLS/edge functions trust. |
| Bootstrap for fresh envs | `SUPER_ADMIN_BOOTSTRAP_EMAILS` secret + `bootstrap-super-admins` edge function | Idempotent seed. |
| Client-side UX hints (optional) | `VITE_SUPER_ADMIN_EMAILS` build env | Empty in production. Never a security control. |

## Secret format

`SUPER_ADMIN_BOOTSTRAP_EMAILS` — comma- or whitespace-separated list of
lowercased emails, e.g.:

```
founder1@example.com, founder2@example.com
```

Managed via Lovable secrets → available to edge functions as
`Deno.env.get('SUPER_ADMIN_BOOTSTRAP_EMAILS')`. Never committed.

## Provisioning a fresh environment

1. Set `SUPER_ADMIN_BOOTSTRAP_EMAILS` in the target project's secrets.
2. Invoke the edge function with the service-role key or as an existing super
   admin (chicken-and-egg for brand-new envs: use the service-role key):

   ```bash
   curl -X POST \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$SUPABASE_URL/functions/v1/bootstrap-super-admins"
   ```

3. Response: `{ ok: true, seeded: N, inserted: M }`. Re-running is a no-op.

## Manual grant / revoke

Grants and revocations are audited via the `super_admins_audit` trigger →
`admin_audit_logs`. Prefer SQL over ad-hoc:

```sql
-- Grant
INSERT INTO public.super_admins (email, note)
VALUES (lower('new.admin@example.com'), 'manual grant: <reason>');

-- Revoke
UPDATE public.super_admins
SET revoked_at = now()
WHERE email = lower('old.admin@example.com');
```

## Guardrail

`scripts/qa/check-no-hardcoded-admin-emails.cjs` fails CI if any of the
placeholder founder emails reappear anywhere in the tree. Extend that
denylist when adding new founder addresses to the secret.
