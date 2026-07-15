import { supabase } from '@/integrations/supabase/client';
import { TripRole, TripChannel } from '@/types/roleChannels';
import { MockRolesService } from '@/services/mockRolesService';

/** Cap role-list fetches so Team tab controls never stay disabled forever. */
export const FETCH_TRIP_ROLES_TIMEOUT_MS = 12_000;

type TripRoleRow = {
  id: string;
  trip_id: string;
  role_name: string;
  description: string | null;
  permission_level: string | null;
  feature_permissions: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type TripChannelRow = {
  id: string;
  channel_name: string;
  is_archived: boolean | null;
  required_role_id: string | null;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function mapChannelRow(row: TripChannelRow, tripId: string): TripChannel {
  return {
    id: row.id,
    tripId,
    channelName: row.channel_name,
    channelSlug: row.channel_name.toLowerCase().replace(/\s+/g, '-'),
    requiredRoleId: row.required_role_id || '',
    isPrivate: true,
    isArchived: Boolean(row.is_archived),
    createdBy: '',
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Load trip roles without embedding trip_channels in the primary select.
 *
 * The previous `trip_channels!required_role_id` embed evaluated
 * `can_access_channel` RLS per row and could leave the Team tab stuck on
 * "Loading roles..." (which also greys out Create Role). Roles, member
 * counts, and channels are fetched as separate bounded queries so a channel
 * RLS failure cannot block the role list.
 */
export async function fetchTripRoles(
  tripId: string,
  isDemoMode: boolean,
  timeoutMs: number = FETCH_TRIP_ROLES_TIMEOUT_MS,
): Promise<TripRole[]> {
  if (isDemoMode) {
    const mockRoles = MockRolesService.getRolesForTrip(tripId);
    return mockRoles || [];
  }

  return withTimeout(fetchTripRolesLive(tripId), timeoutMs, 'fetchTripRoles');
}

async function fetchTripRolesLive(tripId: string): Promise<TripRole[]> {
  const { data, error } = await supabase
    .from('trip_roles')
    .select(
      'id, trip_id, role_name, description, permission_level, feature_permissions, created_by, created_at, updated_at',
    )
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const roleRows = (data || []) as TripRoleRow[];
  if (roleRows.length === 0) return [];

  const roleIds = roleRows.map(role => role.id);

  // Single assignment query instead of N+1 head-count round-trips.
  const countsByRoleId = new Map<string, number>();
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('user_trip_roles')
    .select('role_id')
    .eq('trip_id', tripId)
    .in('role_id', roleIds);

  if (assignmentError) {
    // Counts are decorative — roles must still render.
    if (import.meta.env.DEV) {
      console.warn('[fetchTripRoles] Failed to load role member counts:', assignmentError);
    }
  } else {
    for (const row of assignmentRows || []) {
      const roleId = row.role_id as string;
      countsByRoleId.set(roleId, (countsByRoleId.get(roleId) || 0) + 1);
    }
  }

  // Soft-fail channels: RLS on trip_channels must not block Manage Roles.
  const channelsByRoleId = new Map<string, TripChannel[]>();
  const { data: channelRows, error: channelError } = await supabase
    .from('trip_channels')
    .select('id, channel_name, is_archived, required_role_id')
    .in('required_role_id', roleIds);

  if (channelError) {
    if (import.meta.env.DEV) {
      console.warn('[fetchTripRoles] Failed to load role channels:', channelError);
    }
  } else {
    for (const row of (channelRows || []) as TripChannelRow[]) {
      if (!row.required_role_id) continue;
      const existing = channelsByRoleId.get(row.required_role_id) || [];
      existing.push(mapChannelRow(row, tripId));
      channelsByRoleId.set(row.required_role_id, existing);
    }
  }

  return roleRows.map(role => ({
    id: role.id,
    tripId: role.trip_id,
    roleName: role.role_name,
    description: role.description || '',
    permissionLevel: (role.permission_level as TripRole['permissionLevel']) || 'edit',
    featurePermissions: role.feature_permissions as TripRole['featurePermissions'],
    createdBy: role.created_by,
    createdAt: role.created_at,
    updatedAt: role.updated_at,
    memberCount: countsByRoleId.get(role.id) || 0,
    channels: channelsByRoleId.get(role.id) || [],
  }));
}
