/**
 * usePendingActions — Manages AI-created pending actions that need user confirmation.
 *
 * When the AI concierge (voice or text) wants to create a task, poll, or calendar event,
 * instead of writing directly to shared state, it writes to `trip_pending_actions`.
 * The user then confirms or rejects each action via this hook.
 *
 * On confirm: the original mutation payload is executed and the pending action is resolved.
 * On reject: the pending action is marked rejected (no shared-state write).
 *
 * Security: all Supabase writes use the authenticated user's JWT; RLS enforces trip
 * membership on trip_events, trip_tasks, and trip_payment_messages. trip_id is always
 * sourced from the pending action row (server-verified), never from user input.
 */

import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as typedSupabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { tripKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

// trip_pending_actions is not in the generated Supabase types yet; cast the client
// to bypass type inference for this hook only. Runtime behavior is unchanged.
const supabase = typedSupabase as any;

export interface PendingAction {
  id: string;
  trip_id: string;
  user_id: string;
  tool_name: string;
  tool_call_id: string | null;
  payload: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  source_type: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface UsePendingActionsOptions {
  autoConfirmOwnActions?: boolean;
}

const globalAutoConfirmedIds = new Set<string>();
const globalAutoConfirmInFlightIds = new Set<string>();

export function selectAutoConfirmPendingActions(
  pendingActions: PendingAction[],
  userId: string | undefined,
  confirmedIds: ReadonlySet<string>,
  inFlightIds: ReadonlySet<string>,
): PendingAction[] {
  if (!userId) return [];
  return pendingActions.filter(
    action =>
      action.user_id === userId &&
      action.status === 'pending' &&
      !confirmedIds.has(action.id) &&
      !inFlightIds.has(action.id),
  );
}

type PendingActionToolName =
  | 'createTask'
  | 'updateTask'
  | 'deleteTask'
  | 'createPoll'
  | 'closePoll'
  | 'saveLink'
  | 'addToCalendar'
  | 'duplicateCalendarEvent'
  | 'bulkMarkTasksDone'
  | 'cloneActivity'
  | 'addExpense'
  | 'updateTripDetails'
  | 'createBroadcast'
  | 'createNotification'
  | 'settleExpense';

function assertNeverToolName(toolName: never): never {
  throw new Error(`Unknown tool: ${toolName}`);
}

export function usePendingActions(tripId: string, options: UsePendingActionsOptions = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const autoConfirmOwnActions = options.autoConfirmOwnActions ?? false;

  // In-flight confirm guard: prevents the same actionId from being confirmed
  // twice when a user rapidly double-taps the confirm button before the
  // mutation resolves. Auto-confirm has its own `autoConfirmedIds` guard.
  const inFlightConfirms = useRef<Set<string>>(new Set());

  const queryKey = ['pendingActions', tripId];

  // Fetch pending actions for this trip
  const { data: pendingActions = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<PendingAction[]> => {
      if (isDemoMode || !tripId || !user?.id) return [];

      const { data, error } = await supabase
        .from('trip_pending_actions')
        .select('*')
        .eq('trip_id', tripId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PendingAction[];
    },
    enabled: !!tripId && !!user?.id && !isDemoMode,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Confirm a pending action — execute the actual mutation
  const confirmMutation = useMutation({
    mutationFn: async (actionId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Double-confirm guard: bail out if this id is already being confirmed.
      if (inFlightConfirms.current.has(actionId)) {
        throw new Error('Confirmation already in progress');
      }
      inFlightConfirms.current.add(actionId);

      // Fetch the pending action
      const { data: action, error: fetchError } = await supabase
        .from('trip_pending_actions')
        .select('*')
        .eq('id', actionId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .single();

      if (fetchError || !action) {
        throw new Error('Pending action not found or already resolved');
      }

      const payload = action.payload as Record<string, unknown>;

      // Execute the original mutation based on tool_name.
      // trip_id always comes from the action row (server-verified), not user input.
      const toolName = action.tool_name as PendingActionToolName;
      switch (toolName) {
        case 'createTask': {
          // intentional: source_type column may not be in generated types yet
          const { data: taskRow, error } = await (supabase as any)
            .from('trip_tasks')
            .insert({
              trip_id: action.trip_id,
              creator_id: (payload.creator_id as string) || user.id,
              title: payload.title as string,
              description: (payload.description as string | null) || null,
              due_at: (payload.due_at as string | null) || null,
              source_type: 'ai_concierge',
            })
            .select()
            .single();
          if (error) throw error;

          // Write parity: also create task_status + task_assignments rows so the
          // task shows correct completion state and assignees in the UI, matching
          // what the manual task creation path does.
          if (taskRow?.id) {
            const assignees = (payload.assignedTo as string[]) || [user.id];
            // task_assignments
            await (supabase as any).from('task_assignments').insert(
              assignees.map((uid: string) => ({
                task_id: taskRow.id,
                user_id: uid,
              })),
            );
            // task_status — mark as incomplete for each assignee
            await (supabase as any).from('task_status').insert(
              assignees.map((uid: string) => ({
                task_id: taskRow.id,
                user_id: uid,
                completed: false,
              })),
            );
          }
          break;
        }

        case 'createPoll': {
          // intentional: trip_polls insert with trip_id may not match generated types
          const { error } = await (supabase as any)
            .from('trip_polls')
            .insert({
              trip_id: action.trip_id,
              created_by: (payload.created_by as string) || user.id,
              question: payload.question as string,
              options: payload.options as unknown[],
              status: 'active',
              source_type: 'ai_concierge',
            })
            .select()
            .single();
          if (error) throw error;
          break;
        }

        case 'addToCalendar': {
          // intentional: source_type column may not be in generated types yet
          const { error } = await (supabase as any)
            .from('trip_events')
            .insert({
              trip_id: action.trip_id,
              created_by: (payload.created_by as string) || user.id,
              title: payload.title as string,
              start_time: payload.start_time as string,
              end_time: (payload.end_time as string | null) || null,
              location: (payload.location as string | null) || null,
              description: (payload.description as string | null) || null,
              source_type: 'ai_concierge',
            })
            .select()
            .single();
          if (error) throw error;
          break;
        }

        case 'duplicateCalendarEvent': {
          // Payload contains pre-computed new start/end times stored by functionExecutor.
          const { error } = await (supabase as any).from('trip_events').insert({
            trip_id: action.trip_id,
            created_by: user.id,
            title: payload.source_title as string,
            start_time: payload.new_start_time as string,
            end_time: (payload.new_end_time as string | null) || null,
            location: (payload.location as string | null) || null,
            description: (payload.description as string | null) || null,
            event_category: (payload.event_category as string | null) || null,
            source_type: 'ai_concierge',
          });
          if (error) throw error;
          break;
        }

        case 'bulkMarkTasksDone': {
          const taskIds = payload.task_ids as string[];
          if (!Array.isArray(taskIds) || taskIds.length === 0) {
            throw new Error('No task IDs in payload');
          }
          // eq(trip_id) adds defense-in-depth on top of RLS
          const { error } = await (supabase as any)
            .from('trip_tasks')
            .update({ completed: true, completed_at: new Date().toISOString() })
            .in('id', taskIds)
            .eq('trip_id', action.trip_id);
          if (error) throw error;
          break;
        }

        case 'cloneActivity': {
          // Payload contains pre-computed clone objects stored by functionExecutor
          const clones = payload.clones as Array<{
            title: string;
            start_time: string;
            end_time: string | null;
            location: string | null;
            description: string | null;
            event_category: string | null;
          }>;
          if (!Array.isArray(clones) || clones.length === 0) {
            throw new Error('No clones in payload');
          }
          const { error } = await (supabase as any).from('trip_events').insert(
            clones.map(c => ({
              trip_id: action.trip_id,
              created_by: user.id,
              title: c.title,
              start_time: c.start_time,
              end_time: c.end_time || null,
              location: c.location || null,
              description: c.description || null,
              event_category: c.event_category || null,
              source_type: 'ai_concierge',
            })),
          );
          if (error) throw error;
          break;
        }

        case 'addExpense': {
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const rawParticipants = Array.isArray(payload.split_participants)
            ? (payload.split_participants as string[])
            : [];
          if (
            rawParticipants.length > 0 &&
            !rawParticipants.every(participant => uuidPattern.test(participant))
          ) {
            throw new Error(
              'Expense split participants must be member IDs. Please retry with a member selection.',
            );
          }
          const splitParticipants = rawParticipants.length > 0 ? rawParticipants : [user.id];
          const splitCount = splitParticipants.length;
          const { error } = await (supabase.rpc as any)('create_payment_with_splits_v2', {
            p_trip_id: action.trip_id,
            p_amount: payload.amount as number,
            p_currency: (payload.currency as string) || 'USD',
            p_description: payload.description as string,
            p_split_count: splitCount,
            p_split_participants: splitParticipants,
            p_payment_methods: [],
            p_created_by: user.id,
          });
          if (error) throw error;
          break;
        }

        case 'updateTripDetails': {
          // Build update payload from stored fields
          const updatePayload: Record<string, unknown> = {};
          if (payload.name) updatePayload.name = payload.name;
          if (payload.destination !== undefined) updatePayload.destination = payload.destination;
          if (payload.description !== undefined) updatePayload.description = payload.description;
          if (payload.start_date !== undefined) updatePayload.start_date = payload.start_date;
          if (payload.end_date !== undefined) updatePayload.end_date = payload.end_date;
          if (Object.keys(updatePayload).length === 0) break;
          const { error } = await (supabase as any)
            .from('trips')
            .update(updatePayload)
            .eq('id', action.trip_id);
          if (error) throw error;
          break;
        }

        case 'createBroadcast': {
          // Server-side executor fast-paths this write and marks the row confirmed.
          // We only reach here when the fast-path was skipped (manual confirm, or
          // service-role call without userId). RLS on `broadcasts` enforces
          // membership; the DB trigger notify_on_broadcast() fans out notifications
          // with fanout_event_key dedup.
          const validPriorities = new Set(['normal', 'urgent']);
          const rawPriority = String((payload.priority as string) || 'normal');
          const safePriority = validPriorities.has(rawPriority) ? rawPriority : 'normal';
          const { error } = await (supabase as any).from('broadcasts').insert({
            trip_id: action.trip_id,
            created_by: (payload.created_by as string) || user.id,
            message: payload.message as string,
            priority: safePriority,
            is_sent: true,
          });
          if (error) throw error;
          break;
        }

        case 'createNotification': {
          // Deliver through the canonical create-notification edge function (service-role
          // fan-out with organizer/admin authz + preference gating), trip-wide and excluding
          // the requester. A direct client insert into `notifications` is intentionally
          // blocked by RLS — those rows target OTHER users — so mirror the server executor
          // path here. Concierge announcements map to the 'broadcasts' category.
          const { error } = await supabase.functions.invoke('create-notification', {
            body: {
              tripId: action.trip_id,
              type: 'broadcasts',
              title: payload.title as string,
              message: payload.message as string,
              metadata: { source: 'ai_concierge', created_by: user.id },
              excludeUserId: user.id,
            },
          });
          if (error) throw error;
          break;
        }

        case 'settleExpense': {
          const splitId = payload.split_id as string;
          if (!splitId) throw new Error('No split_id in payload');
          // Crediting transition — atomic RPC (row lock + status guard);
          // ALREADY_SETTLED means the desired end state already holds.
          const { data, error } = await supabase.rpc('settle_payment_split', {
            p_split_id: splitId,
            p_user_id: user.id,
            p_method: (payload.method as string) ?? null,
          });
          if (error) throw error;
          const result = (data ?? {}) as { success?: boolean; error?: string };
          if (!result.success && result.error !== 'ALREADY_SETTLED') {
            throw new Error(result.error || 'Failed to settle expense');
          }
          break;
        }

        case 'updateTask': {
          const taskId = payload.task_id as string;
          if (!taskId) throw new Error('No task_id in payload');
          const updatePayload: Record<string, unknown> = {};
          if (payload.title !== undefined) updatePayload.title = payload.title;
          if (payload.description !== undefined) updatePayload.description = payload.description;
          if (payload.due_at !== undefined) updatePayload.due_at = payload.due_at;
          if (payload.completed !== undefined) {
            updatePayload.completed = Boolean(payload.completed);
            updatePayload.completed_at = payload.completed ? new Date().toISOString() : null;
          }
          if (Object.keys(updatePayload).length === 0) break;
          const { error } = await (supabase as any)
            .from('trip_tasks')
            .update(updatePayload)
            .eq('id', taskId)
            .eq('trip_id', action.trip_id);
          if (error) throw error;
          break;
        }

        case 'deleteTask': {
          const taskId = payload.task_id as string;
          if (!taskId) throw new Error('No task_id in payload');
          const { error } = await (supabase as any)
            .from('trip_tasks')
            .delete()
            .eq('id', taskId)
            .eq('trip_id', action.trip_id);
          if (error) throw error;
          break;
        }

        case 'closePoll': {
          const pollId = payload.poll_id as string;
          if (!pollId) throw new Error('No poll_id in payload');
          const { error } = await (supabase as any)
            .from('trip_polls')
            .update({ status: 'closed' })
            .eq('id', pollId)
            .eq('trip_id', action.trip_id);
          if (error) throw error;
          break;
        }

        case 'saveLink': {
          const { error } = await (supabase as any).from('trip_links').insert({
            trip_id: action.trip_id,
            title: payload.title as string,
            url: payload.url as string,
            description: (payload.description as string | null) || null,
            category: (payload.category as string | null) || null,
            added_by: (payload.added_by as string) || user.id,
          });
          if (error) throw error;
          break;
        }

        default:
          assertNeverToolName(toolName);
      }

      // Mark as confirmed — re-check status to prevent TOCTOU race
      // intentional: trip_pending_actions not yet in generated Supabase types
      const { error: updateError } = await (supabase as any)
        .from('trip_pending_actions')
        .update({
          status: 'confirmed',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', actionId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (updateError) throw new Error('Action was already confirmed by someone else.');

      return action;
    },
    onSuccess: action => {
      const toolLabelMap: Record<string, string> = {
        createTask: 'Task',
        updateTask: 'Task updated',
        deleteTask: 'Task deleted',
        createPoll: 'Poll',
        closePoll: 'Poll closed',
        saveLink: 'Link saved',
        addToCalendar: 'Calendar event',
        duplicateCalendarEvent: 'Event duplicated',
        bulkMarkTasksDone: 'Tasks marked complete',
        cloneActivity: 'Activity cloned',
        addExpense: 'Expense added',
        updateTripDetails: 'Trip details updated',
        createBroadcast: 'Broadcast sent',
        createNotification: 'Notification sent',
        settleExpense: 'Expense settled',
      };
      const label = toolLabelMap[action.tool_name] || 'Action confirmed';
      const isVerb = [
        'Task updated',
        'Task deleted',
        'Poll closed',
        'Link saved',
        'Event duplicated',
        'Tasks marked complete',
        'Activity cloned',
        'Expense added',
        'Trip details updated',
        'Broadcast sent',
        'Notification sent',
        'Expense settled',
      ].includes(label);
      toast.success(isVerb ? label : `${label} created`);

      const toolName = action.tool_name as PendingActionToolName;
      const tripId = action.trip_id;

      // Invalidate relevant queries — use exact: false for prefix matching
      // so ['tripTasks', tripId, isDemoMode] variants are also invalidated.
      switch (toolName) {
        case 'createTask':
        case 'updateTask':
        case 'deleteTask':
        case 'bulkMarkTasksDone':
          queryClient.invalidateQueries({ queryKey: ['tripTasks', tripId], exact: false });
          break;
        case 'createPoll':
        case 'closePoll':
          queryClient.invalidateQueries({ queryKey: ['tripPolls', tripId], exact: false });
          break;
        case 'saveLink':
          queryClient.invalidateQueries({ queryKey: ['tripLinks', tripId], exact: false });
          queryClient.invalidateQueries({ queryKey: ['tripPlaces', tripId], exact: false });
          break;
        case 'addToCalendar':
        case 'duplicateCalendarEvent':
        case 'cloneActivity':
          queryClient.invalidateQueries({ queryKey: tripKeys.calendar(tripId), exact: false });
          break;
        case 'addExpense':
          queryClient.invalidateQueries({ queryKey: tripKeys.payments(tripId), exact: false });
          break;
        case 'updateTripDetails':
          queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId), exact: false });
          queryClient.invalidateQueries({ queryKey: tripKeys.all, exact: false });
          break;
        case 'createBroadcast':
          queryClient.invalidateQueries({ queryKey: ['broadcasts', tripId], exact: false });
          queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
          break;
        case 'createNotification':
          queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
          break;
        case 'settleExpense':
          queryClient.invalidateQueries({ queryKey: tripKeys.payments(tripId), exact: false });
          break;
        default:
          assertNeverToolName(toolName as never);
      }
    },
    onError: (error: Error) => {
      // Suppress the noisy toast for the deliberate double-tap guard.
      if (error.message === 'Confirmation already in progress') return;
      toast.error(error.message || 'Failed to confirm action');
    },
    onSettled: (_data, _error, actionId) => {
      // Release the in-flight guard whether the confirm succeeded or failed
      // so a legitimate retry after a real failure isn't permanently blocked.
      if (typeof actionId === 'string') inFlightConfirms.current.delete(actionId);
    },
  });

  // Reject a pending action
  const rejectMutation = useMutation({
    mutationFn: async (actionId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      // intentional: trip_pending_actions not yet in generated Supabase types
      const { error } = await (supabase as any)
        .from('trip_pending_actions')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', actionId)
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;
      return actionId;
    },
    onSuccess: () => {
      toast('Action dismissed');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject action');
    },
  });

  // Auto-confirm pending actions created by the current user.
  // Batch-process ALL self-owned pending actions in one tick (e.g. multi-tool messages
  // that create both a calendar event AND a task). Auto-confirm is intentionally owned
  // by the trip shell, not by Concierge chat, so the same row cannot race across mounts.
  useEffect(() => {
    if (!autoConfirmOwnActions) return;
    if (!user?.id || pendingActions.length === 0) return;

    const selfPending = selectAutoConfirmPendingActions(
      pendingActions,
      user.id,
      globalAutoConfirmedIds,
      globalAutoConfirmInFlightIds,
    );

    if (selfPending.length === 0) return;

    selfPending.forEach(a => {
      globalAutoConfirmedIds.add(a.id);
      globalAutoConfirmInFlightIds.add(a.id);
    });
    void Promise.all(
      selfPending.map(a =>
        confirmMutation
          .mutateAsync(a.id)
          .catch(err => {
            // Allow re-attempt on next tick if the confirm failed (e.g. transient RLS race)
            globalAutoConfirmedIds.delete(a.id);
            if (import.meta.env.DEV) console.warn('[usePendingActions] auto-confirm failed', err);
          })
          .finally(() => {
            globalAutoConfirmInFlightIds.delete(a.id);
          }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirmOwnActions, pendingActions, user?.id]);

  return {
    pendingActions,
    isLoading,
    confirmAction: confirmMutation.mutate,
    confirmActionAsync: confirmMutation.mutateAsync,
    rejectAction: rejectMutation.mutate,
    rejectActionAsync: rejectMutation.mutateAsync,
    isConfirming: confirmMutation.isPending,
    isRejecting: rejectMutation.isPending,
    hasPendingActions: pendingActions.length > 0,
  };
}
