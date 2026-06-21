import {
  supabase,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_ANON_KEY,
} from '@/integrations/supabase/client';

export type AccountDeletionResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Permanently deletes the signed-in user's account via the delete-account edge function.
 * App Store Guideline 5.1.1(v) requires in-app account deletion; execution is immediate.
 */
export async function deleteAccountImmediately(): Promise<AccountDeletionResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (sessionError || !token) {
    return { success: false, error: 'Your session expired. Please sign in again and retry.' };
  }

  try {
    const response = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLIC_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });

    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      message?: string;
    } | null;

    if (!response.ok || !payload?.success) {
      return {
        success: false,
        error:
          payload?.error ?? 'Failed to delete your account. Please contact privacy@chravelapp.com',
      };
    }

    return {
      success: true,
      message: payload.message ?? 'Your account and data have been permanently deleted.',
    };
  } catch {
    return {
      success: false,
      error: 'Network error. Please check your connection and retry.',
    };
  }
}
