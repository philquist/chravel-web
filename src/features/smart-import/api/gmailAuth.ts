import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type GmailAccount = {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  // token_expires_at: safe TIMESTAMPTZ (not a credential) — used to show reconnect UX
  // RLS on gmail_accounts_safe is row-scoped (auth.uid() = user_id); no token values exposed
  // migration 20260403000000_gmail_accounts_safe_with_status.sql adds these to the view
  token_expires_at: string | null;
  last_synced_at: string | null;
};

export async function extractFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const isFunctionsHttpError =
    error instanceof FunctionsHttpError ||
    (typeof error === 'object' &&
      error !== null &&
      'context' in error &&
      typeof (error as { context?: unknown }).context === 'object');

  if (isFunctionsHttpError) {
    try {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (!context || typeof context.json !== 'function') {
        throw new Error('Missing error context body');
      }
      const body = await context.json();
      if (body && typeof body === 'object') {
        const errValue = (body as Record<string, unknown>).error;
        if (typeof errValue === 'string' && errValue.trim().length > 0) {
          return errValue;
        }
      }
    } catch {
      // Ignore body parse failures and use fallback below.
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function resolveGmailOAuthRedirectUri(): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return null;
  }
  return `${window.location.origin}/api/gmail/oauth/callback`;
}

export const fetchGmailAccounts = async (): Promise<GmailAccount[]> => {
  // Query the safe view — token columns are not exposed to the frontend.
  // token_expires_at and last_synced_at are timing hints, not credentials.
  // RLS on gmail_accounts_safe is row-scoped (auth.uid() = user_id).
  // Cast needed: gmail_accounts_safe view may not be in generated Supabase types.
  const { data, error } = await (supabase.from as unknown as (table: string) => any)(
    'gmail_accounts_safe',
  )
    .select('id, email, created_at, token_expires_at, last_synced_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as unknown as GmailAccount[];
};

export const connectGmailAccount = async (): Promise<string> => {
  const redirectUri = resolveGmailOAuthRedirectUri();
  if (import.meta.env.DEV && redirectUri) {
    // Heads-up: the backend allowlists redirect URIs via GOOGLE_REDIRECT_URI +
    // GOOGLE_ADDITIONAL_REDIRECT_URIS. If this origin isn't registered there
    // (and in Google Cloud), the backend silently falls back to the default,
    // and OAuth completes on the wrong origin.
    console.info('[gmail-auth] requesting redirect_uri =', redirectUri);
  }
  try {
    // Ensure the user has a fresh, non-expired session before invoking the
    // edge function. Without this, a stale local JWT causes the function's
    // auth.getUser() call to fail with 401 "Unauthorized" — the most common
    // cause of "Failed to initiate connection" errors after preview idle.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) {
      throw new Error('You need to be signed in to connect a Gmail account.');
    }
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    if (!expiresAtMs || expiresAtMs - Date.now() < 60_000) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error(
          'Your session expired. Please sign out and back in, then try connecting Gmail again.',
        );
      }
    }

    const { data, error } = await supabase.functions.invoke('gmail-auth/connect', {
      method: 'POST',
      body: redirectUri ? { redirectUri } : undefined,
    });

    if (error) {
      throw error;
    }

    return data.url;
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('Error initiating Gmail connect:', error);
    }
    // Surface the edge function's specific message verbatim (e.g.
    // "GOOGLE_CLIENT_ID secret is not set.") so the Settings UI can show it.
    const message = await extractFunctionErrorMessage(
      error,
      'Failed to initiate Gmail connection. Check OAuth setup and secrets.',
    );
    throw new Error(message);
  }
};

export const disconnectGmailAccount = async (accountId: string): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('gmail-auth/disconnect', {
      method: 'POST',
      body: { accountId },
    });

    if (error) {
      throw error;
    }
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('Error disconnecting Gmail account:', error);
    }
    const message = await extractFunctionErrorMessage(error, 'Failed to disconnect Gmail account');
    throw new Error(message);
  }
};

export const handleGmailCallback = async (
  code: string,
  state: string,
): Promise<{ success: boolean; email?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('gmail-auth/callback', {
      method: 'POST',
      body: { code, state },
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('Error completing Gmail connection:', error);
    }
    const message = await extractFunctionErrorMessage(error, 'Failed to complete Gmail connection');
    throw new Error(message);
  }
};
