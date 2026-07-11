import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * MCP OAuth consent screen. Supabase Auth (the authorization server) redirects
 * the user here with an `authorization_id` query param when an MCP client
 * (ChatGPT, Claude, Cursor, etc.) requests access to the user's Chravel account.
 *
 * The user reviews the requesting client and approves or denies. On both paths
 * Supabase returns a redirect URL that hands control back to the MCP client.
 *
 * The `supabase.auth.oauth` namespace is currently in beta; the local typed
 * wrapper below matches the three methods we call.
 */

type AuthorizationDetails = {
  client?: { name?: string | null; client_uri?: string | null };
  redirect_url?: string | null;
  redirect_to?: string | null;
} & Record<string, unknown>;

type OAuthNamespace = {
  getAuthorizationDetails(
    id: string,
  ): Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization(id: string): Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization(id: string): Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
};

function getOAuth(): OAuthNamespace | null {
  const maybe = (supabase.auth as unknown as { oauth?: OAuthNamespace }).oauth;
  return maybe ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Missing authorization_id in the request.');
        return;
      }
      const oauth = getOAuth();
      if (!oauth) {
        setError(
          'Supabase OAuth server is not enabled for this project. Enable OAuth 2.1 in the Supabase dashboard (Authentication → OAuth Server) and try again.',
        );
        return;
      }

      const { data: sessionResult } = await supabase.auth.getSession();
      if (!sessionResult.session) {
        // Preserve the full consent URL so auth returns the user here.
        const next = window.location.pathname + window.location.search;
        window.location.href = '/auth?next=' + encodeURIComponent(next);
        return;
      }

      const { data, error: detailsError } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuth();
    if (!oauth) return;
    setBusy(true);
    const { data, error: decisionError } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('No redirect returned by the authorization server.');
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : !details ? (
        <p className="text-muted-foreground">Loading authorization request…</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">
              Connect {details.client?.name ?? 'an app'} to Chravel
            </h1>
            <p className="mt-2 text-muted-foreground">
              This lets {details.client?.name ?? 'the requesting client'} use Chravel's MCP tools as
              you. You can revoke access at any time from your account settings.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(true)}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(false)}
              className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Deny
            </button>
          </div>
        </>
      )}
    </main>
  );
}
