import type { PermissionAction, PermissionResource } from './permissionMatrix.generated.ts';

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: { message?: string } | null }>;
};

export async function assertTripActorPermission(
  supabase: RpcClient,
  userId: string,
  tripId: string,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<void> {
  const { data, error } = await supabase.rpc('can_trip_actor_for_user', {
    p_user_id: userId,
    p_trip_id: tripId,
    p_resource: resource,
    p_action: action,
  });

  if (error || data !== true) {
    throw new Error(`PERMISSION_DENIED:${resource}:${action}`);
  }
}

/** Maps concierge mutation tools to resolver resource/action pairs. */
export const AI_MUTATION_PERMISSIONS: Record<
  string,
  { resource: PermissionResource; action: PermissionAction }
> = {
  createTask: { resource: 'tasks', action: 'write' },
  addToCalendar: { resource: 'calendar', action: 'write' },
  createPoll: { resource: 'polls', action: 'write' },
  closePoll: { resource: 'polls', action: 'admin' },
  deletePoll: { resource: 'polls', action: 'delete' },
  saveLink: { resource: 'links', action: 'write' },
  addExploreLink: { resource: 'links', action: 'write' },
  setTripBasecamp: { resource: 'basecamp', action: 'admin' },
  updateTask: { resource: 'tasks', action: 'write' },
  deleteTask: { resource: 'tasks', action: 'delete' },
  rescheduleEvent: { resource: 'calendar', action: 'write' },
  deleteCalendarEvent: { resource: 'calendar', action: 'delete' },
};

export async function assertAiToolPermission(
  supabase: RpcClient,
  userId: string | undefined,
  tripId: string,
  toolName: string,
): Promise<void> {
  if (!userId) {
    throw new Error('PERMISSION_DENIED:unauthenticated');
  }
  const rule = AI_MUTATION_PERMISSIONS[toolName];
  if (!rule) return;
  await assertTripActorPermission(supabase, userId, tripId, rule.resource, rule.action);
}
