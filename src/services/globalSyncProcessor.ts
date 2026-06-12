/**
 * Global Sync Processor
 *
 * Provides all handlers for processing the unified offline sync queue.
 * This ensures no operations are dropped due to missing handlers.
 *
 * Call this from App.tsx or a dedicated sync hook to process all queued operations.
 */

import { offlineSyncService } from './offlineSyncService';
import { supabase } from '@/integrations/supabase/client';
import { sendChatMessage, sendRichChatMessage } from './chatService';
import { calendarService } from './calendarService';
import { shouldUseLegacyChatSync } from './stream/streamTransportGuards';
import { deleteLegacyOfflineDatabases } from '@/offline/db';

export { shouldUseLegacyChatSync };

/**
 * Process sync queue with all handlers
 *
 * This should be called:
 * - When connection is restored (online event)
 * - Periodically when online
 * - On app startup if online
 */
export async function processGlobalSyncQueue(): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  if (!navigator.onLine) {
    return { processed: 0, failed: 0, skipped: 0 };
  }

  // Get all operations before processing to check for skipped ones
  const allOperations = await offlineSyncService.getQueuedOperations({ status: 'pending' });

  const shouldProcessLegacyChat = shouldUseLegacyChatSync();

  const result = await offlineSyncService.processSyncQueue({
    // Chat message handlers
    onChatMessageCreate: shouldProcessLegacyChat
      ? async (_tripId, data) => {
          // Prefer rich sender with client_message_id dedupe (if provided).
          if (data?.client_message_id) {
            return await sendRichChatMessage(data);
          }
          return await sendChatMessage(data);
        }
      : undefined,
    onChatMessageUpdate: shouldProcessLegacyChat
      ? async (entityId, data) => {
          // Chat message updates are rare, but handle if needed
          const { data: updated, error } = await supabase
            .from('trip_chat_messages')
            .update(data)
            .eq('id', entityId)
            .select()
            .single();

          if (error) throw error;
          return updated;
        }
      : undefined,

    // Task handlers - delegate to task service
    onTaskCreate: async (tripId, data) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newTask, error } = await (supabase.from('trip_tasks') as any)
        .insert({
          trip_id: tripId,
          creator_id: user.id,
          title: data.title,
          description: data.description,
          due_at: data.due_at,
          is_poll: data.is_poll,
        })
        .select()
        .single();

      if (error) throw error;
      return newTask;
    },
    onTaskUpdate: async (entityId, data) => {
      const { data: updated, error } = await supabase
        .from('trip_tasks')
        .update(data)
        .eq('id', entityId)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onTaskToggle: async (entityId, data) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Fetch latest version so queued toggles don't conflict.
      const { data: taskRow, error: taskErr } = await supabase
        .from('trip_tasks')
        .select('version')
        .eq('id', entityId)
        .maybeSingle();
      if (taskErr) throw taskErr;

      // Use the same atomic function as useTripTasks
      const { error } = await supabase.rpc('toggle_task_status', {
        p_task_id: entityId,
        p_user_id: user.id,
        p_completed: data.completed as boolean,
        p_current_version: taskRow?.version ?? 1,
      });

      if (error) throw error;
      return { taskId: entityId, completed: data.completed };
    },

    // Poll handlers (MVP: votes only)
    onPollVote: async (pollId, data) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // intentional: data shape varies per sync operation
      const optionIds: string[] = Array.isArray((data as any)?.optionIds)
        ? (data as any).optionIds
        : typeof (data as any)?.optionIds === 'string'
          ? [(data as any).optionIds]
          : [];

      if (optionIds.length === 0) {
        throw new Error('No poll optionIds provided');
      }

      const voteWithLatestVersion = async (): Promise<void> => {
        const { data: pollRow, error: pollErr } = await supabase
          .from('trip_polls')
          .select('version')
          .eq('id', pollId)
          .maybeSingle();
        if (pollErr) throw pollErr;

        for (const optionId of optionIds) {
          const { error } = await supabase.rpc('vote_on_poll', {
            p_poll_id: pollId,
            p_option_id: optionId,
            p_user_id: user.id,
            p_current_version: pollRow?.version ?? null,
          });
          if (error) throw error;
        }
      };

      try {
        await voteWithLatestVersion();
      } catch (e) {
        // Retry once on optimistic-lock conflicts.
        const errorMessage = e instanceof Error ? e.message : '';
        if (errorMessage.includes('modified by another user') || errorMessage.includes('version')) {
          await voteWithLatestVersion();
          return { pollId, optionIds };
        }
        throw e;
      }

      return { pollId, optionIds };
    },

    // Calendar event handlers
    onCalendarEventCreate: async (tripId, data) => {
      // intentional: data shape validated at caller
      const result = await calendarService.createEvent(data as any);
      if (!result) throw new Error('Failed to create calendar event');
      return result;
    },
    onCalendarEventUpdate: async (entityId, data) => {
      const success = await calendarService.updateEvent(entityId, data);
      if (!success) throw new Error('Failed to update calendar event');
      return { id: entityId, ...data };
    },
    onCalendarEventDelete: async entityId => {
      const success = await calendarService.deleteEvent(entityId);
      if (!success) throw new Error('Failed to delete calendar event');
      return { id: entityId };
    },
  });

  // Count skipped operations (those without handlers)
  const operationsAfter = await offlineSyncService.getQueuedOperations({ status: 'pending' });
  const skipped = allOperations.length - operationsAfter.length - result.processed - result.failed;

  return {
    ...result,
    skipped: Math.max(0, skipped), // Ensure non-negative
  };
}

/**
 * Hook to use in App.tsx or a dedicated sync component
 * Processes sync queue when connection is restored
 */
export function setupGlobalSyncProcessor() {
  if (typeof window === 'undefined') return;

  // Reclaim storage quota from IDB databases left behind by deleted legacy
  // modules (chravel-chat-db, chravel-offline-queue). One-shot, fire-and-forget.
  deleteLegacyOfflineDatabases();

  const handleOnline = async () => {
    try {
      const result = await processGlobalSyncQueue();

      if (result.skipped > 0) {
        console.warn(`[Sync] ${result.skipped} operations skipped (no handlers)`);
      }
    } catch (error) {
      console.error('[Sync] Error processing sync queue:', error);
    }
  };

  // Process on mount if online
  if (navigator.onLine) {
    handleOnline();
  }

  // Process when connection restored
  window.addEventListener('online', handleOnline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
