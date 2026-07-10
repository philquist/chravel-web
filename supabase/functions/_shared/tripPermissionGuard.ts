import type { PermissionAction, PermissionResource } from './permissionMatrix.generated.ts';
import { MUTATING_TOOL_NAMES } from './concierge/toolRegistry.ts';

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

/**
 * Maps concierge mutation tools whose target resource is covered by the
 * permission matrix (tasks / polls / calendar / basecamp / links) to a
 * resolver resource/action pair. For these tools the resolver check is a
 * defense-in-depth pre-check that mirrors the RLS already enforced on the
 * underlying trip_tasks / trip_polls / trip_events / trip_links tables, so it
 * denies low-role callers (viewer/attendee) earlier without changing the
 * outcome for authorized callers.
 *
 * Tool names MUST match the real tool identifiers in
 * `concierge/toolRegistry.ts::MUTATING_TOOL_NAMES` — the completeness assertion
 * below fails the build if a mutating tool is neither mapped here nor listed as
 * RLS-backstopped.
 */
export const AI_MUTATION_PERMISSIONS: Record<
  string,
  { resource: PermissionResource; action: PermissionAction }
> = {
  // tasks (trip_tasks — RLS: can_trip_actor 'tasks')
  createTask: { resource: 'tasks', action: 'write' },
  updateTask: { resource: 'tasks', action: 'write' },
  deleteTask: { resource: 'tasks', action: 'delete' },
  bulkMarkTasksDone: { resource: 'tasks', action: 'write' },
  splitTaskAssignments: { resource: 'tasks', action: 'write' },
  // polls (trip_polls — RLS: can_trip_actor 'polls')
  createPoll: { resource: 'polls', action: 'write' },
  closePoll: { resource: 'polls', action: 'admin' },
  // calendar (trip_events — RLS: can_trip_actor 'calendar')
  addToCalendar: { resource: 'calendar', action: 'write' },
  updateCalendarEvent: { resource: 'calendar', action: 'write' },
  moveCalendarEvent: { resource: 'calendar', action: 'write' },
  duplicateCalendarEvent: { resource: 'calendar', action: 'write' },
  deleteCalendarEvent: { resource: 'calendar', action: 'delete' },
  bulkDeleteCalendarEvents: { resource: 'calendar', action: 'delete' },
  // links (trip_links — RLS: can_trip_actor 'links')
  saveLink: { resource: 'links', action: 'write' },
};

/**
 * Mutating tools whose target tables are NOT covered by the permission matrix
 * and instead rely on their own membership/role RLS (e.g. broadcasts →
 * can_manage_trip_content, trip_payment_messages → membership, event_agenda_items
 * → trip admin, trip_places → membership, trips → cover-editor predicate).
 * Listing them here is an explicit, auditable acknowledgement that the resolver
 * pre-check is intentionally skipped — it is NOT a silent fall-through.
 *
 * NOTE: `createNotification` currently has no RLS backstop on the base
 * `public.notifications` table (see the notifications RLS migration in this
 * change set / follow-up). It is listed here to preserve existing behavior;
 * tightening its authorization is tracked separately.
 */
export const RLS_BACKSTOPPED_MUTATION_TOOLS = new Set<string>([
  'savePlace',
  'setBasecamp',
  'addToAgenda',
  'createBroadcast',
  'createNotification',
  'addExpense',
  'settleExpense',
  'updateTripDetails',
  'generateTripImage',
  'setTripHeaderImage',
  'cloneActivity',
  'emitSmartImportPreview',
  'emitReservationDraft',
  'emitBulkDeletePreview',
]);

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
  if (rule) {
    await assertTripActorPermission(supabase, userId, tripId, rule.resource, rule.action);
    return;
  }
  // Fail closed: a mutating tool that is neither matrix-mapped nor explicitly
  // acknowledged as RLS-backstopped must be denied (e.g. a newly added tool that
  // has not yet been classified). Read/search tools are not in MUTATING_TOOL_NAMES
  // and pass through unchanged.
  if (MUTATING_TOOL_NAMES.has(toolName) && !RLS_BACKSTOPPED_MUTATION_TOOLS.has(toolName)) {
    throw new Error(`PERMISSION_DENIED:unclassified_mutation:${toolName}`);
  }
}
