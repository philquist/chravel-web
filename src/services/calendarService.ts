import { supabase } from '@/integrations/supabase/client';
import { syncTripMemberToStreamChannelsOnly } from '@/lib/streamTripMemberInlineActivity';
import { reportStreamMembershipSyncFailure } from '@/services/stream/streamMembershipCoordinator';
import type { Json } from '@/integrations/supabase/types';
import type { CalendarEvent, TripEvent, CreateEventData } from '@/types/calendar';
import { demoModeService } from './demoModeService';
import { demoTripEventsByTripId } from '@/mockData/demoTripEvents';
import { calendarStorageService } from './calendarStorageService';
import { calendarOfflineQueue } from './calendarOfflineQueue';
import { offlineSyncService } from './offlineSyncService';
import { retryWithBackoff } from '@/utils/retry';
// SECURITY: Super admin access is now enforced entirely server-side via is_super_admin() RLS.
// Client-side SUPER_ADMIN_EMAILS import removed to eliminate misleading bypass paths.
import { normalizeCalendarCategory } from '@/constants/calendarCategories';

// Re-export for backward compatibility — consumers should migrate to '@/types/calendar'
export type { TripEvent, CreateEventData } from '@/types/calendar';

export const calendarService = {
  /**
   * Ensure user is a trip member before performing operations that require membership.
   * If user is the trip creator but not a member, automatically add them.
   * SECURITY: Super admin access is enforced server-side via is_super_admin() RLS function.
   * Client-side bypass removed to prevent misleading privilege escalation paths.
   */
  async ensureTripMembership(tripId: string, userId: string): Promise<boolean> {
    try {
      // Check if user is already a trip member
      const { data: existingMember } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        return true; // Already a member
      }

      // Check if user is the trip creator
      const { data: trip } = await supabase
        .from('trips')
        .select('created_by')
        .eq('id', tripId)
        .single();

      if (trip?.created_by === userId) {
        // User is the creator - add them as admin member
        const { error: insertError } = await supabase.from('trip_members').insert({
          trip_id: tripId,
          user_id: userId,
          role: 'admin',
          status: 'active',
        });

        if (insertError) {
          // Check if it's a duplicate error (user was added by another process)
          if (insertError.code === '23505') {
            return true; // Already a member (race condition)
          }
          if (import.meta.env.DEV) {
            console.warn('Failed to auto-add user as member:', insertError);
          }
          return false;
        }
        void syncTripMemberToStreamChannelsOnly({
          tripId,
          userId,
          syncFailureContext: 'calendarService.ensureTripMembership',
        }).catch(streamError => {
          reportStreamMembershipSyncFailure(
            'calendarService.ensureTripMembership',
            { tripId, userId },
            streamError,
          );
        });
        return true;
      }

      // User is neither a member nor the creator
      return false;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error ensuring trip membership:', error);
      }
      return false;
    }
  },

  /**
   * Check if the new event overlaps with any existing events.
   * Returns an array of conflicting event titles (empty if no conflicts).
   */
  async checkForConflicts(
    tripId: string,
    startTime: string,
    endTime?: string,
    excludeId?: string,
  ): Promise<string[]> {
    try {
      const events = await this.getTripEvents(tripId);
      const newStart = new Date(startTime).getTime();
      const newEnd = endTime ? new Date(endTime).getTime() : newStart + 3600000; // Default 1 hour if no end time

      const conflicts: string[] = [];

      for (const event of events) {
        // Skip the event being edited so it doesn't conflict with itself
        if (excludeId && event.id === excludeId) continue;

        const eventStart = new Date(event.start_time).getTime();
        const eventEnd = event.end_time ? new Date(event.end_time).getTime() : eventStart + 3600000; // Default 1 hour if no end time

        // Check if times overlap
        const overlaps = newStart < eventEnd && newEnd > eventStart;
        if (overlaps) {
          conflicts.push(event.title);
        }
      }

      return conflicts;
    } catch (error) {
      console.warn('Could not check for conflicts:', error);
      return []; // Don't block on conflict check failure
    }
  },

  async createEvent(
    eventData: CreateEventData,
  ): Promise<{ event: TripEvent | null; conflicts: string[] }> {
    const conflicts: string[] = [];

    try {
      // Validate required fields
      if (!eventData.trip_id) {
        console.error('[calendarService] Missing trip_id in event data');
        throw new Error('Trip ID is required to create an event');
      }
      if (!eventData.title?.trim()) {
        console.error('[calendarService] Missing title in event data');
        throw new Error('Event title is required');
      }
      if (!eventData.start_time) {
        console.error('[calendarService] Missing start_time in event data');
        throw new Error('Event start time is required');
      }

      // Check if in demo mode
      const isDemoMode = await demoModeService.isDemoModeEnabled();

      // Check for conflicts first (non-blocking - just for notification)
      const existingConflicts = await this.checkForConflicts(
        eventData.trip_id,
        eventData.start_time,
        eventData.end_time,
      );
      conflicts.push(...existingConflicts);

      if (isDemoMode) {
        // Use localStorage for demo mode
        const event = await calendarStorageService.createEvent(eventData);
        return { event, conflicts };
      }

      // Check if offline - queue the operation
      if (!navigator.onLine) {
        const queueId = await calendarOfflineQueue.queueCreate(eventData.trip_id, eventData);

        // Also queue in unified sync service
        await offlineSyncService.queueOperation(
          'calendar_event',
          'create',
          eventData.trip_id,
          eventData as unknown as Record<string, unknown>,
        );

        // Return optimistic event for immediate UI update
        const {
          data: { user },
        } = await supabase.auth.getUser();
        return {
          event: {
            id: queueId,
            ...eventData,
            created_by:
              user?.id ||
              ((eventData as unknown as Record<string, unknown>).created_by as string) ||
              user?.id ||
              '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 1,
          } as TripEvent,
          conflicts,
        };
      }

      // Use Supabase for authenticated users - direct insert
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error('[calendarService] User not authenticated');
        throw new Error('You must be logged in to create events. Please sign in and try again.');
      }

      // Ensure trip membership for RLS policies
      // SECURITY: Super admin read access is enforced server-side via is_super_admin() RLS
      // function (migration 20260125000000). No client-side bypass needed.
      const hasMembership = await this.ensureTripMembership(eventData.trip_id, user.id);
      if (!hasMembership) {
        if (import.meta.env.DEV) {
          console.warn(
            '[calendarService] User not a trip member and could not be added. Trip ID:',
            eventData.trip_id,
          );
        }
        // Don't throw here - let the insert fail with a more descriptive RLS error
        // The insert will fail if the user truly doesn't have access
      }

      // Direct insert - simpler and more reliable than RPC
      const createdEvent = await retryWithBackoff(
        async () => {
          const { data: directEvent, error: directError } = await supabase
            .from('trip_events')
            .insert({
              trip_id: eventData.trip_id,
              title: eventData.title,
              description: eventData.description || null,
              location: eventData.location || null,
              start_time: eventData.start_time,
              end_time: eventData.end_time || null,
              created_by: user.id,
              event_category: eventData.event_category || 'other',
              include_in_itinerary: eventData.include_in_itinerary ?? true,
              is_all_day: eventData.is_all_day ?? false,
              source_type: eventData.source_type || 'manual',
              source_data: (eventData.source_data || {}) as Json,
              ...(eventData.idempotency_key ? { idempotency_key: eventData.idempotency_key } : {}),
            })
            .select('*')
            .single();

          if (directError) {
            console.error('[calendarService] Insert failed:', directError);
            // Provide more specific error messages based on error type
            if (
              directError.code === '42501' ||
              directError.message?.includes('RLS') ||
              directError.message?.includes('policy')
            ) {
              throw new Error(
                'You do not have permission to add events to this trip. Please contact the trip admin.',
              );
            }
            if (directError.code === '23503' || directError.message?.includes('foreign key')) {
              throw new Error('This trip no longer exists or is invalid.');
            }
            if (directError.code === '23505') {
              throw new Error('An event with this information already exists.');
            }
            throw new Error(directError.message || 'Failed to create event. Please try again.');
          }
          return directEvent;
        },
        {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            if (import.meta.env.DEV) {
              console.warn(
                `Retry attempt ${attempt}/3 for creating calendar event:`,
                error.message,
              );
            }
          },
        },
      );

      // Cache the created event
      await offlineSyncService.cacheEntity(
        'calendar_event',
        createdEvent.id,
        createdEvent.trip_id,
        createdEvent,
        createdEvent.version || 1,
      );

      return { event: createdEvent as unknown as TripEvent, conflicts };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error creating event:', error);
      }

      // If offline, the operation was already queued above
      if (!navigator.onLine) {
        return { event: null, conflicts };
      }

      throw error; // Re-throw so the hook can catch and display the actual error
    }
  },

  async getTripEvents(tripId: string): Promise<TripEvent[]> {
    // Declare outside try block for catch block access
    let cachedEvents: Array<{ data: unknown }> = [];

    try {
      // ⚡ Parallelize demo-mode check + offline cache read (previously sequential)
      // Skip IndexedDB cache read when online to save 100-500ms of I/O
      const [isDemoMode, offlineCached] = await Promise.all([
        demoModeService.isDemoModeEnabled(),
        navigator.onLine
          ? Promise.resolve([])
          : offlineSyncService.getCachedEntities(tripId, 'calendar_event'),
      ]);

      cachedEvents = offlineCached;

      if (isDemoMode) {
        const storedEvents = await calendarStorageService.getEvents(tripId);
        const seededEvents = demoTripEventsByTripId[tripId] || [];

        if (storedEvents.length === 0 && seededEvents.length > 0) {
          await calendarStorageService.setEvents(tripId, seededEvents);
          return seededEvents;
        }

        return storedEvents;
      }

      // ⚡ Use getSession() (cached/synchronous) instead of getUser() (network call)
      // getUser() makes a network round-trip to validate the JWT and can take 5-8s
      // on cold start or flaky connections. getSession() returns the cached session.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        // Fallback to direct query if no session
        const { data, error } = await supabase
          .from('trip_events')
          .select('*')
          .eq('trip_id', tripId)
          .order('start_time', { ascending: true })
          .limit(1000);

        if (error) throw error;
        return (data || []) as unknown as TripEvent[];
      }

      // Direct query - fast and reliable.
      // The timezone RPC (get_events_in_user_tz) can hang if the function
      // doesn't exist in the remote DB, causing infinite spinner.
      const { data: events, error: fetchError } = await supabase
        .from('trip_events')
        .select('*')
        .eq('trip_id', tripId)
        .order('start_time', { ascending: true })
        .limit(1000);

      if (fetchError) throw fetchError;

      if (!events || events.length === 0) {
        return [];
      }

      // Cache events for offline access (fire-and-forget to avoid blocking return)
      Promise.all(
        events.map(event =>
          offlineSyncService.cacheEntity(
            'calendar_event',
            event.id,
            event.trip_id,
            event,
            event.version || 1,
          ),
        ),
      ).catch(() => {
        // Swallow cache write errors — non-critical
      });

      return events as unknown as TripEvent[];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching events:', error);
      }

      // If fetch fails, return cached events if available
      if (cachedEvents.length > 0) {
        if (import.meta.env.DEV) {
          console.warn('Using cached events due to fetch error');
        }
        return cachedEvents.map(c => c.data as TripEvent);
      }

      return [];
    }
  },

  async updateEvent(
    eventId: string,
    updates: Partial<TripEvent>,
    currentVersion?: number,
  ): Promise<boolean> {
    // Validate required parameter
    if (!eventId) {
      console.error('[calendarService] Missing eventId for update');
      throw new Error('Event ID is required to update an event');
    }

    // Check if in demo mode
    const isDemoMode = await demoModeService.isDemoModeEnabled();

    if (isDemoMode) {
      // Extract trip_id from the eventId or use updates
      const tripId = updates.trip_id || eventId.split('-')[0]; // Fallback logic
      const updatedEvent = await calendarStorageService.updateEvent(tripId, eventId, updates);
      if (!updatedEvent) {
        throw new Error('Failed to update event in demo mode');
      }
      return true;
    }

    // Check if offline - queue the operation
    if (!navigator.onLine) {
      const tripId = updates.trip_id || '';
      const version =
        currentVersion ?? ((updates as Record<string, unknown>).version as number | undefined);

      await calendarOfflineQueue.queueUpdate(tripId, eventId, updates, version);
      await offlineSyncService.queueOperation(
        'calendar_event',
        'update',
        tripId,
        updates,
        eventId,
        version,
      );

      return true; // Optimistic success
    }

    // Get current user for logging
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to update events. Please sign in and try again.');
    }

    // Use versioned RPC when version is available to prevent concurrent overwrites.
    // Falls back to direct UPDATE for events created before version column existed.
    if (currentVersion != null) {
      const { error: rpcError } = await (supabase as any).rpc('update_event_with_version', {
        // intentional: RPC not in generated types yet
        p_event_id: eventId,
        p_current_version: currentVersion,
        p_title: updates.title ?? null,
        p_description: updates.description ?? null,
        p_start_time: updates.start_time ?? null,
        p_end_time: updates.end_time ?? null,
        p_location: updates.location ?? null,
        p_event_category: updates.event_category ?? null,
        p_include_in_itinerary: updates.include_in_itinerary ?? null,
        p_is_all_day: updates.is_all_day ?? null,
        p_source_data: updates.source_data ? (updates.source_data as unknown) : null,
      });

      if (rpcError) {
        // Check for version conflict
        if (rpcError.message?.includes('modified by another user') || rpcError.code === 'P0001') {
          throw new Error(
            'CONFLICT: This event was modified by another user. Please refresh and try again.',
          );
        }
        if (rpcError.message?.includes('not found') || rpcError.code === 'P0002') {
          throw new Error('Event not found. It may have been deleted.');
        }

        // If the RPC doesn't exist yet, fall through to direct UPDATE
        const missingFn =
          rpcError.message?.toLowerCase().includes('does not exist') || rpcError.code === '42883';

        if (!missingFn) {
          console.error('[calendarService] Versioned update RPC failed:', rpcError);
          throw new Error(rpcError.message || 'Failed to update event. Please try again.');
        }

        console.warn(
          '[calendarService] update_event_with_version RPC not found, falling back to direct UPDATE',
        );
      } else {
        // RPC succeeded — update cache
        const cached = await offlineSyncService.getCachedEntity('calendar_event', eventId);
        if (cached) {
          await offlineSyncService.cacheEntity(
            'calendar_event',
            eventId,
            cached.tripId,
            { ...cached.data, ...updates, version: (currentVersion || 1) + 1 },
            (currentVersion || 1) + 1,
          );
        }
        return true;
      }
    }

    // Fallback: direct UPDATE (no version check — for backward compat or missing RPC)
    const { data, error } = await supabase
      .from('trip_events')
      .update({
        ...(updates as Record<string, unknown>),
        updated_at: new Date().toISOString(),
      } as unknown) // intentional: TripEvent partial lacks Json index signature
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      console.error('[calendarService] Update failed:', error);
      if (
        error.code === '42501' ||
        error.message?.includes('RLS') ||
        error.message?.includes('policy')
      ) {
        throw new Error(
          'You do not have permission to update this event. Only the event creator or trip admin can edit it.',
        );
      }
      if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
        throw new Error(
          'Event update failed — no matching event found or you do not have permission to edit it.',
        );
      }
      throw new Error(error.message || 'Failed to update event. Please try again.');
    }

    if (!data) {
      console.error(
        '[calendarService] Update returned no data - likely RLS blocked or event not found',
      );
      throw new Error(
        'Event update failed — no rows updated. You may not have permission to edit this event.',
      );
    }

    // Update cache with the returned data
    const cached = await offlineSyncService.getCachedEntity('calendar_event', eventId);
    if (cached) {
      await offlineSyncService.cacheEntity(
        'calendar_event',
        eventId,
        cached.tripId,
        data,
        data.version || cached.version || 1,
      );
    }

    return true;
  },

  async deleteEvent(eventId: string, tripId?: string): Promise<boolean> {
    try {
      // Check if in demo mode
      const isDemoMode = await demoModeService.isDemoModeEnabled();

      if (isDemoMode) {
        // For demo mode, we need the trip ID to delete from localStorage
        if (!tripId) {
          if (import.meta.env.DEV) {
            console.error('Trip ID required for demo mode event deletion');
          }
          return false;
        }
        return await calendarStorageService.deleteEvent(tripId, eventId);
      }

      // Check if offline - queue the operation
      if (!navigator.onLine && tripId) {
        await calendarOfflineQueue.queueDelete(tripId, eventId);
        await offlineSyncService.queueOperation('calendar_event', 'delete', tripId, {}, eventId);

        // Remove from cache
        await offlineSyncService.removeCachedEntity('calendar_event', eventId);

        return true; // Optimistic success
      }

      // Use Supabase for authenticated users
      const { error } = await supabase.from('trip_events').delete().eq('id', eventId);

      if (!error) {
        // Remove from cache
        await offlineSyncService.removeCachedEntity('calendar_event', eventId);
      }

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting event:', error);
      }
      return false;
    }
  },

  /**
   * Bulk delete events by IDs. Tries a single DELETE query first.
   * Only chunks if the ID list exceeds PostgREST URL limits (~200 UUIDs).
   * Returns structured result with alreadyMissing count for stale preview handling.
   */
  async bulkDeleteEvents(
    eventIds: string[],
    tripId: string,
  ): Promise<{ deleted: number; alreadyMissing: number; failed: number }> {
    if (eventIds.length === 0) return { deleted: 0, alreadyMissing: 0, failed: 0 };

    try {
      const CHUNK_SIZE = 200;
      let totalDeleted = 0;
      let totalFailed = 0;

      const chunks: string[][] = [];
      for (let i = 0; i < eventIds.length; i += CHUNK_SIZE) {
        chunks.push(eventIds.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        const { data, error } = await supabase
          .from('trip_events')
          .delete()
          .in('id', chunk)
          .eq('trip_id', tripId)
          .select('id');

        if (error) {
          // Fall back to parallel deletion for this chunk
          const results = await Promise.all(chunk.map(id => this.deleteEvent(id, tripId)));
          for (const ok of results) {
            if (ok) totalDeleted++;
            else totalFailed++;
          }
        } else {
          totalDeleted += (data || []).length;
        }
      }

      const alreadyMissing = eventIds.length - totalDeleted - totalFailed;

      // Remove from offline cache
      for (const id of eventIds) {
        await offlineSyncService.removeCachedEntity('calendar_event', id);
      }

      return {
        deleted: totalDeleted,
        alreadyMissing: Math.max(0, alreadyMissing),
        failed: totalFailed,
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error in bulkDeleteEvents:', error);
      }
      return { deleted: 0, alreadyMissing: 0, failed: eventIds.length };
    }
  },

  /**
   * Bulk create events using batched inserts.
   * Uses source_type: 'bulk_import' so the notify_on_calendar_event trigger
   * skips per-event notifications (avoids DB timeout on 82+ games, 100+ city tours).
   *
   * For <= 50 events: single bulk insert (fast).
   * For > 50 events: chunked bulk inserts (50 per chunk) with progress.
   * Falls back to sequential one-by-one on any chunk error.
   */
  async bulkCreateEvents(
    events: CreateEventData[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<{
    imported: number;
    failed: number;
    events: TripEvent[];
  }> {
    if (!events.length) {
      return { imported: 0, failed: 0, events: [] };
    }

    // Demo mode: use localStorage (no Supabase)
    const isDemoMode = await demoModeService.isDemoModeEnabled();
    if (isDemoMode) {
      let imported = 0;
      let failed = 0;
      const createdEvents: TripEvent[] = [];
      for (let i = 0; i < events.length; i++) {
        try {
          const event = await calendarStorageService.createEvent(events[i]);
          imported++;
          createdEvents.push(event);
        } catch {
          failed++;
        }
        onProgress?.(i + 1, events.length);
      }
      return { imported, failed, events: createdEvents };
    }

    // 1. Auth and connectivity
    if (!navigator.onLine) {
      throw new Error(
        'You must be online to import events. Please check your connection and try again.',
      );
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to import events.');

    // 2. Membership check ONCE (all events share the same trip)
    const tripId = events[0].trip_id;
    await this.ensureTripMembership(tripId, user.id);

    // 3. Build insert rows.
    // Prefer caller source_type for provenance (gmail/concierge/url), but default
    // to bulk_import so the notify_on_calendar_event trigger still skips per-event
    // fanout for large imports.
    const BULK_SAFE_SOURCE_TYPES = new Set([
      'bulk_import',
      'gmail_import',
      'ai_concierge_import',
      'ai_extracted',
      'ai_concierge',
    ]);
    const rows: Array<{
      trip_id: string;
      title: string;
      description: string | null;
      location: string | null;
      start_time: string;
      end_time: string | null;
      created_by: string;
      event_category: string;
      include_in_itinerary: boolean;
      is_all_day: boolean;
      source_type: string;
      source_data: Json;
      idempotency_key: string | null;
      import_batch_id: string | null;
    }> = events.map(e => {
      const requested = e.source_type || 'bulk_import';
      const sourceType = BULK_SAFE_SOURCE_TYPES.has(requested) ? requested : 'bulk_import';
      return {
        trip_id: e.trip_id,
        title: e.title,
        description: e.description || null,
        location: e.location || null,
        start_time: e.start_time,
        end_time: e.end_time || null,
        created_by: user.id,
        event_category: e.event_category || 'other',
        include_in_itinerary: e.include_in_itinerary ?? true,
        is_all_day: e.is_all_day ?? false,
        source_type: sourceType,
        source_data: (e.source_data || {}) as Json,
        idempotency_key: e.idempotency_key ?? null,
        import_batch_id: e.import_batch_id ?? null,
      };
    });

    const CHUNK_SIZE = 50;

    // 4. Single batch: <= CHUNK_SIZE events
    if (rows.length <= CHUNK_SIZE) {
      const { data, error } = await supabase
        .from('trip_events')
        .upsert(rows, { onConflict: 'trip_id,idempotency_key', ignoreDuplicates: true })
        .select('id');

      if (!error) {
        // ignoreDuplicates returns only newly inserted rows (not conflict skips)
        const imported = data?.length ?? 0;
        onProgress?.(rows.length, rows.length);
        console.info(
          `[calendarService] Bulk insert succeeded: ${imported} imported of ${rows.length} submitted`,
        );
        if (imported > 0) {
          this.fetchAndCacheRecentEvents(tripId, imported);
          this.sendBulkImportNotification(tripId, imported, user.id);
        }
        return { imported, failed: 0, events: [] };
      }

      console.error(
        `[calendarService] Bulk insert failed: ${error.message} (code: ${error.code}). Falling back to sequential.`,
      );
      return await this.batchInsertEvents(rows, onProgress);
    }

    // 5. Chunked bulk: > CHUNK_SIZE events — insert 50 at a time with progress
    let imported = 0;
    let failed = 0;
    const allEvents: TripEvent[] = [];

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('trip_events')
        .upsert(chunk, { onConflict: 'trip_id,idempotency_key', ignoreDuplicates: true })
        .select('id');

      if (!error) {
        imported += data?.length ?? 0;
        onProgress?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
      } else {
        // Chunk failed — fall back to sequential for this chunk
        console.warn(
          `[calendarService] Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${error.message}. Falling back to sequential for chunk.`,
        );
        const result = await this.batchInsertEvents(chunk, (c, _t) =>
          onProgress?.(i + c, rows.length),
        );
        imported += result.imported;
        failed += result.failed;
        allEvents.push(...result.events);
      }
    }

    if (allEvents.length > 0) {
      this.cacheEventsInBackground(allEvents);
    } else if (imported > 0) {
      this.fetchAndCacheRecentEvents(tripId, imported);
    }

    console.info(
      `[calendarService] Chunked bulk import complete: ${imported} imported, ${failed} failed out of ${rows.length}`,
    );

    if (imported > 0) {
      this.sendBulkImportNotification(tripId, imported, user.id);
    }

    return { imported, failed, events: allEvents };
  },

  /**
   * Send a single aggregated notification after a bulk calendar import.
   * Prevents notification spam from individual event inserts.
   */
  sendBulkImportNotification(tripId: string, count: number, excludeUserId: string): void {
    import('../services/notificationService')
      .then(({ notificationService }) => {
        notificationService.sendPushNotification({
          tripId,
          excludeUserId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- notification type not in generated types yet
          type: 'calendar_bulk_import' as any,
          title: `${count} New Calendar Events Added`,
          body: `${count} calendar events have been added via Smart Import. Open ChravelApp to review.`,
          icon: '/chravel-logo.png',
          data: {
            tripId,
            type: 'calendar_bulk_import',
            count,
            bulk_import: true,
            import_session_id: `import-${Date.now()}`,
          },
        });
      })
      .catch(err => {
        if (import.meta.env.DEV) {
          console.error('[calendarService] Failed to send bulk import notification:', err);
        }
      });
  },

  /**
   * Insert events sequentially one-by-one with a delay between each.
   * This avoids overwhelming the notification trigger system and ensures
   * partial success — if one event fails, the rest still import.
   */
  async batchInsertEvents(
    rows: Array<{
      trip_id: string;
      title: string;
      description: string | null;
      location: string | null;
      start_time: string;
      end_time: string | null;
      created_by: string;
      event_category: string;
      include_in_itinerary: boolean;
      is_all_day: boolean;
      source_type: string;
      source_data: Json;
      idempotency_key: string | null;
      import_batch_id?: string | null;
    }>,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<{ imported: number; failed: number; events: TripEvent[] }> {
    let imported = 0;
    let failed = 0;
    const allEvents: TripEvent[] = [];
    const failedReasons: string[] = [];

    // Sequential one-by-one inserts with delay to avoid trigger overload
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const { data, error } = await supabase
          .from('trip_events')
          .upsert(row, { onConflict: 'trip_id,idempotency_key', ignoreDuplicates: true })
          .select('*')
          .single();

        if (error) {
          console.error(
            `[calendarService] Insert ${i + 1}/${rows.length} failed for "${row.title}": ${error.message} (code: ${error.code})`,
          );
          failed++;
          failedReasons.push(`${row.title}: ${error.message}`);
        } else if (data) {
          imported++;
          allEvents.push(data as unknown as TripEvent);
        } else {
          failed++;
          failedReasons.push(`${row.title}: Insert returned no data`);
        }
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : 'Unknown error';
        failedReasons.push(`${row.title}: ${reason}`);
        console.error(
          `[calendarService] Insert ${i + 1}/${rows.length} threw for "${row.title}": ${reason}`,
        );
      }

      // Report progress
      onProgress?.(i + 1, rows.length);

      // 100ms delay between inserts to let notification triggers complete
      if (i < rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.info(
      `[calendarService] Sequential import complete: ${imported} imported, ${failed} failed out of ${rows.length}`,
    );

    if (allEvents.length > 0) {
      this.cacheEventsInBackground(allEvents);
    }

    if (failed > 0 && failedReasons.length > 0) {
      const uniqueReasons = [...new Set(failedReasons)];
      console.error(
        `[calendarService] Import completed with ${failed} failures. Reasons: ${uniqueReasons.join('; ')}`,
      );
    }

    return { imported, failed, events: allEvents };
  },

  /**
   * Cache events in background for offline access. Best-effort, non-blocking.
   */
  cacheEventsInBackground(events: TripEvent[]): void {
    Promise.all(
      events.map(event =>
        offlineSyncService
          .cacheEntity(
            'calendar_event',
            event.id,
            event.trip_id,
            event as unknown as Record<string, unknown>,
            event.version || 1,
          )
          .catch(() => {}),
      ),
    ).catch(() => {});
  },

  /**
   * After a successful bulk insert, fetch the recently inserted events for caching.
   * Best-effort and non-blocking — does not affect the import result.
   */
  fetchAndCacheRecentEvents(tripId: string, expectedCount: number): void {
    Promise.resolve(
      supabase
        .from('trip_events')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(expectedCount),
    )
      .then(({ data }) => {
        if (data && data.length > 0) {
          this.cacheEventsInBackground(data as unknown as TripEvent[]);
        }
      })
      .catch(() => {});
  },

  convertToCalendarEvent(
    tripEvent: TripEvent & {
      creator?: { display_name?: string; avatar_url?: string };
      recurrence_rule?: string;
      recurrence_exceptions?: string[];
      parent_event_id?: string;
      is_busy?: boolean;
      availability_status?: string;
    },
  ): CalendarEvent {
    // Read is_all_day from the field or from source_data as fallback for old rows
    const sourceDataObj = tripEvent.source_data as Record<string, unknown> | null;
    const isAllDay = tripEvent.is_all_day ?? sourceDataObj?.is_all_day === true;

    // For all-day events, build dates from UTC components so the calendar date is
    // timezone-invariant: a UTC-midnight timestamp reads as the same date everywhere.
    const toUtcDate = (iso: string) => {
      const r = new Date(iso);
      return new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()));
    };
    const rawStartDate = new Date(tripEvent.start_time);
    const startDate = isAllDay ? toUtcDate(tripEvent.start_time) : rawStartDate;

    return {
      id: tripEvent.id,
      title: tripEvent.title,
      date: startDate,
      time: isAllDay
        ? ''
        : rawStartDate.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          }),
      location: tripEvent.location,
      description: tripEvent.description,
      createdBy: tripEvent.created_by,
      creatorName: tripEvent.creator?.display_name || 'Former Member',
      creatorAvatar: tripEvent.creator?.avatar_url,
      include_in_itinerary: tripEvent.include_in_itinerary ?? true,
      is_all_day: isAllDay,
      end_date: tripEvent.end_time
        ? isAllDay
          ? toUtcDate(tripEvent.end_time)
          : new Date(tripEvent.end_time)
        : undefined,
      event_category: normalizeCalendarCategory(tripEvent.event_category),
      source_type: (tripEvent.source_type as CalendarEvent['source_type']) ?? 'manual',
      source_data: tripEvent.source_data,
      recurrence_rule: tripEvent.recurrence_rule,
      recurrence_exceptions: tripEvent.recurrence_exceptions,
      parent_event_id: tripEvent.parent_event_id,
      is_busy: tripEvent.is_busy ?? true,
      availability_status: (tripEvent.availability_status || 'busy') as
        | 'busy'
        | 'free'
        | 'tentative',
      end_time: tripEvent.end_time ? new Date(tripEvent.end_time) : undefined,
    };
  },

  // Convert CalendarEvent to database format
  convertFromCalendarEvent(calendarEvent: CalendarEvent, tripId: string): CreateEventData {
    const isAllDay = calendarEvent.is_all_day ?? false;
    let startTimeStr: string;
    let endTimeStr: string | undefined;

    if (isAllDay) {
      // All-day events: store as UTC midnight of the user's chosen local date.
      // Using Date.UTC preserves the calendar date independent of the viewer's timezone.
      const d = calendarEvent.date;
      startTimeStr = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

      const endSrc = calendarEvent.end_date ?? calendarEvent.date;
      endTimeStr = new Date(
        Date.UTC(endSrc.getFullYear(), endSrc.getMonth(), endSrc.getDate(), 23, 59, 59, 999),
      ).toISOString();
    } else {
      const startTime = new Date(calendarEvent.date);
      const [hours, minutes] = calendarEvent.time.split(':');
      startTime.setHours(parseInt(hours), parseInt(minutes));
      startTimeStr = startTime.toISOString();

      if (calendarEvent.end_time) {
        endTimeStr = calendarEvent.end_time.toISOString();
      }
    }

    return {
      trip_id: tripId,
      title: calendarEvent.title,
      description: calendarEvent.description,
      start_time: startTimeStr,
      end_time: endTimeStr,
      location: calendarEvent.location,
      event_category: calendarEvent.event_category || 'other',
      include_in_itinerary: calendarEvent.include_in_itinerary,
      is_all_day: isAllDay,
      source_type: calendarEvent.source_type || 'manual',
      source_data: calendarEvent.source_data || {},
      // Recurring event support
      recurrence_rule: calendarEvent.recurrence_rule,
      recurrence_exceptions: calendarEvent.recurrence_exceptions,
      // Busy/free time blocking
      is_busy: calendarEvent.is_busy ?? true,
      availability_status: calendarEvent.availability_status || 'busy',
    };
  },
};
