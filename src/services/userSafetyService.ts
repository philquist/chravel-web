import { supabase } from '@/integrations/supabase/client';

interface ReportContentParams {
  reportedUserId: string;
  tripId?: string;
  messageId?: string;
  reason: 'spam' | 'harassment' | 'inappropriate' | 'other';
  details?: string;
}

export async function getBlockedUsers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_blocks' as never)
    .select('blocked_id')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch blocked users: ${error.message}`);
  }

  return (data as Array<{ blocked_id: string }>).map(row => row.blocked_id);
}

export interface BlockedUserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Blocked users resolved to display profiles, preserving block recency order.
 * Powers the in-app "Blocked Users" management surface (App Store Guideline 1.2:
 * users must be able to view and unblock the people they've blocked).
 */
export async function getBlockedUserProfiles(): Promise<BlockedUserProfile[]> {
  const ids = await getBlockedUsers();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles_public')
    .select('user_id, display_name, resolved_display_name, avatar_url')
    .in('user_id', ids);

  if (error) {
    throw new Error(`Failed to fetch blocked user profiles: ${error.message}`);
  }

  const profileById = new Map(
    (
      (data ?? []) as Array<{
        user_id: string;
        display_name: string | null;
        resolved_display_name: string | null;
        avatar_url: string | null;
      }>
    ).map(p => [p.user_id, p]),
  );

  // Preserve the most-recent-first order from getBlockedUsers().
  return ids.map(id => {
    const p = profileById.get(id);
    return {
      id,
      displayName: p?.resolved_display_name || p?.display_name || 'ChravelApp user',
      avatarUrl: p?.avatar_url ?? null,
    };
  });
}

export async function blockUser(blockedId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('user_blocks' as never).insert({
    blocker_id: user.id,
    blocked_id: blockedId,
  } as never);

  if (error) {
    if (error.code === '23505') {
      // Already blocked (unique constraint)
      return true;
    }
    throw new Error(`Failed to block user: ${error.message}`);
  }

  return true;
}

export async function unblockUser(blockedId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_blocks' as never)
    .delete()
    .eq('blocker_id' as never, user.id as never)
    .eq('blocked_id' as never, blockedId as never);

  if (error) {
    throw new Error(`Failed to unblock user: ${error.message}`);
  }

  return true;
}

export async function reportContent(params: ReportContentParams): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('content_reports' as never).insert({
    reporter_id: user.id,
    reported_user_id: params.reportedUserId,
    trip_id: params.tripId || null,
    message_id: params.messageId || null,
    reason: params.reason,
    details: params.details || null,
  } as never);

  if (error) {
    throw new Error(`Failed to submit report: ${error.message}`);
  }

  return true;
}
