// System message service — emits inline activity updates into the trip chat.
//
// Architecture: Stream is the canonical chat transport. System messages are
// sent as `message_type: 'system'` with a structured `system_event_type`
// custom field, on the trip channel, with `silent: true` so Stream does not
// generate a push notification for them. Push notifications continue to flow
// through `send_notification()` independently — the UI promise is upheld.
//
// Trip-type gating: emits for consumer, pro, and event trips (all use Stream
// trip chat). Legacy DB triggers may still write `trip_chat_messages` for
// consumer-only; the UI reads Stream, so client-side emission must cover
// every trip type that shows trip chat.

import { supabase } from '@/integrations/supabase/client';
import { isConsumerTrip as isMockConsumerTrip } from '@/utils/tripTierDetector';
import { SystemEventType, SystemMessagePayload } from '@/types/systemMessages';
import { getStreamClient } from './stream/streamClient';
import { CHANNEL_TYPE_TRIP, tripChannelId } from './stream/streamChannelFactory';

interface CachedTripType {
  value: string | null;
  expiresAt: number;
}

class SystemMessageService {
  private uploadBatchQueue: Map<string, { count: number; timer: ReturnType<typeof setTimeout> }> =
    new Map();
  private BATCH_DELAY_MS = 30000; // 30 second batching window for uploads
  private TRIP_TYPE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private tripTypeCache: Map<string, CachedTripType> = new Map();
  // Short-lived dedupe set to prevent double inline posts from React StrictMode
  // double-invokes, network retries, or duplicate onSuccess callbacks.
  private DEDUPE_TTL_MS = 60 * 1000;
  private dedupeKeys: Map<string, number> = new Map();

  private isDuplicateDedupeKey(key?: string): boolean {
    if (!key) return false;
    const now = Date.now();
    // GC expired entries opportunistically
    if (this.dedupeKeys.size > 200) {
      for (const [k, expiresAt] of this.dedupeKeys) {
        if (expiresAt <= now) this.dedupeKeys.delete(k);
      }
    }
    const existing = this.dedupeKeys.get(key);
    if (existing && existing > now) return true;
    this.dedupeKeys.set(key, now + this.DEDUPE_TTL_MS);
    return false;
  }

  /**
   * Resolve a trip's tier with a short-lived cache. Returns 'consumer' for
   * seeded mock IDs without a fetch. Falls back to a single supabase query
   * for real (UUID) trips.
   */
  private async getTripType(tripId: string): Promise<string | null> {
    if (isMockConsumerTrip(tripId)) return 'consumer';

    const cached = this.tripTypeCache.get(tripId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { data } = await supabase
      .from('trips')
      .select('trip_type')
      .eq('id', tripId)
      .maybeSingle();

    if (!data) {
      return null;
    }
    const raw = data.trip_type as string | null | undefined;
    const value =
      raw === null || raw === undefined || String(raw).trim() === '' ? 'consumer' : String(raw);
    this.tripTypeCache.set(tripId, {
      value,
      expiresAt: Date.now() + this.TRIP_TYPE_CACHE_TTL_MS,
    });
    return value;
  }

  private isTripTypeEligibleForInlineActivity(tripType: string | null): boolean {
    if (!tripType) return false;
    return tripType === 'consumer' || tripType === 'pro' || tripType === 'event';
  }

  /**
   * Create a system message in the trip chat (Stream).
   * Emits for consumer, pro, and event trips; no-ops when trip is missing or unknown type.
   *
   * The message is sent with `silent: true` so Stream skips push delivery —
   * push notifications for activity continue to be driven by the
   * `send_notification` Supabase pipeline.
   */
  async createSystemMessage(
    tripId: string,
    eventType: SystemEventType,
    body: string,
    payload?: SystemMessagePayload,
    dedupeKey?: string,
  ): Promise<boolean> {
    if (this.isDuplicateDedupeKey(dedupeKey)) {
      if (import.meta.env.DEV) {
        console.log('[SystemMessage] Deduped:', dedupeKey);
      }
      return false;
    }

    const tripType = await this.getTripType(tripId);
    if (!this.isTripTypeEligibleForInlineActivity(tripType)) {
      return false;
    }

    const client = getStreamClient();
    if (!client?.userID) {
      // Offline / not yet connected — drop quietly. The action that triggered
      // this still succeeded; we just lose the inline activity message.
      return false;
    }

    try {
      const channel = client.channel(CHANNEL_TYPE_TRIP, tripChannelId(tripId));
      await channel.sendMessage(
        {
          text: body,
          message_type: 'system',
          system_event_type: eventType,
          system_payload: (payload ?? {}) as unknown as Record<string, unknown>,
          silent: true,
        } as Parameters<typeof channel.sendMessage>[0],
        { skip_push: true },
      );
      if (import.meta.env.DEV) {
        console.log('[SystemMessage] Emitted to Stream:', eventType, tripId);
      }
      return true;
    } catch (error) {
      console.warn('[SystemMessage] Stream emit failed (non-critical):', error);
      return false;
    }
  }

  /**
   * Create a batched upload system message
   * Collects multiple uploads within 30 seconds and creates a single message
   */
  async createBatchedUploadMessage(
    tripId: string,
    uploaderId: string,
    uploaderName: string,
    mediaType: 'photo' | 'file',
  ): Promise<void> {
    const tripType = await this.getTripType(tripId);
    if (!this.isTripTypeEligibleForInlineActivity(tripType)) {
      return;
    }

    const batchKey = `${tripId}-${uploaderId}-${mediaType}`;
    const existing = this.uploadBatchQueue.get(batchKey);

    if (existing) {
      // Increment count and reset timer
      clearTimeout(existing.timer);
      existing.count += 1;
      existing.timer = setTimeout(
        () => this.flushUploadBatch(batchKey, tripId, uploaderName, mediaType),
        this.BATCH_DELAY_MS,
      );
    } else {
      // Start new batch
      const timer = setTimeout(
        () => this.flushUploadBatch(batchKey, tripId, uploaderName, mediaType),
        this.BATCH_DELAY_MS,
      );
      this.uploadBatchQueue.set(batchKey, { count: 1, timer });
    }
  }

  private async flushUploadBatch(
    batchKey: string,
    tripId: string,
    uploaderName: string,
    mediaType: 'photo' | 'file',
  ): Promise<void> {
    const batch = this.uploadBatchQueue.get(batchKey);
    if (!batch) return;

    this.uploadBatchQueue.delete(batchKey);

    const count = batch.count;
    const eventType = mediaType === 'photo' ? 'photos_uploaded' : 'files_uploaded';
    const itemType = mediaType === 'photo' ? 'photo' : 'file';
    const body = `${uploaderName} uploaded ${count} ${itemType}${count > 1 ? 's' : ''}`;

    await this.createSystemMessage(tripId, eventType, body, {
      actorName: uploaderName,
      mediaCount: count,
      mediaType,
    });
  }

  // Convenience methods for specific event types

  async memberJoined(tripId: string, memberName: string, memberId?: string): Promise<boolean> {
    return this.createSystemMessage(tripId, 'member_joined', `${memberName} joined the trip`, {
      memberName,
      memberId,
      actorName: memberName,
    });
  }

  async memberLeft(tripId: string, memberName: string, memberId?: string): Promise<boolean> {
    return this.createSystemMessage(tripId, 'member_left', `${memberName} left the trip`, {
      memberName,
      memberId,
      actorName: memberName,
    });
  }

  async tripBaseCampUpdated(
    tripId: string,
    actorName: string,
    previousAddress?: string,
    newAddress?: string,
  ): Promise<boolean> {
    let body: string;
    if (previousAddress && newAddress) {
      body = `Base camp changed from ${previousAddress} → ${newAddress}`;
    } else if (newAddress) {
      body = `Base camp set to ${newAddress}`;
    } else {
      body = `Base camp was updated`;
    }

    return this.createSystemMessage(
      tripId,
      'trip_base_camp_updated',
      body,
      { actorName, previousAddress, newAddress },
      `basecamp_updated:${tripId}:${newAddress ?? previousAddress ?? 'unknown'}`,
    );
  }

  async personalBaseCampUpdated(
    tripId: string,
    actorName: string,
    newAddress?: string,
  ): Promise<boolean> {
    const body = newAddress
      ? `${actorName} set their personal base camp to ${newAddress}`
      : `${actorName} updated their personal base camp`;

    return this.createSystemMessage(tripId, 'personal_base_camp_updated', body, {
      actorName,
      newAddress,
    });
  }

  async pollCreated(
    tripId: string,
    actorName: string,
    pollId: string,
    question: string,
  ): Promise<boolean> {
    return this.createSystemMessage(
      tripId,
      'poll_created',
      `${actorName} created a poll: "${question}"`,
      { actorName, pollId, pollQuestion: question },
      `poll_created:${tripId}:${pollId}`,
    );
  }

  async pollClosed(
    tripId: string,
    actorName: string,
    pollId: string,
    winningOption?: string,
  ): Promise<boolean> {
    const body = winningOption ? `Poll closed - "${winningOption}" won` : `A poll was closed`;

    return this.createSystemMessage(
      tripId,
      'poll_closed',
      body,
      { actorName, pollId, winningOption },
      `poll_closed:${tripId}:${pollId}`,
    );
  }

  async taskCreated(
    tripId: string,
    actorName: string,
    taskId: string,
    taskTitle: string,
  ): Promise<boolean> {
    return this.createSystemMessage(
      tripId,
      'task_created',
      `${actorName} added a task: "${taskTitle}"`,
      { actorName, taskId, taskTitle },
      `task_created:${tripId}:${taskId}`,
    );
  }

  async taskCompleted(
    tripId: string,
    actorName: string,
    taskId: string,
    taskTitle: string,
  ): Promise<boolean> {
    return this.createSystemMessage(
      tripId,
      'task_completed',
      `${actorName} completed: "${taskTitle}"`,
      { actorName, taskId, taskTitle },
      `task_completed:${tripId}:${taskId}`,
    );
  }

  async calendarItemAdded(
    tripId: string,
    actorName: string,
    eventId: string,
    eventTitle: string,
  ): Promise<boolean> {
    return this.createSystemMessage(
      tripId,
      'calendar_item_added',
      `${actorName} added "${eventTitle}" to the calendar`,
      { actorName, eventId, eventTitle },
      `calendar_added:${tripId}:${eventId}`,
    );
  }

  async paymentRecorded(
    tripId: string,
    actorName: string,
    paymentId: string,
    amount: number,
    currency: string,
    description: string,
  ): Promise<boolean> {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);

    return this.createSystemMessage(
      tripId,
      'payment_recorded',
      `${actorName} added an expense: ${description} (${formattedAmount})`,
      { actorName, paymentId, amount, currency, description },
      `payment_recorded:${tripId}:${paymentId}`,
    );
  }

  async paymentSettled(
    tripId: string,
    actorName: string,
    paymentId: string,
    description: string,
  ): Promise<boolean> {
    return this.createSystemMessage(
      tripId,
      'payment_settled',
      `${description} was marked as settled`,
      { actorName, paymentId, description },
      `payment_settled:${tripId}:${paymentId}`,
    );
  }

  /** Test/debug only — clears the trip-type cache. */
  _clearTripTypeCache(): void {
    this.tripTypeCache.clear();
  }
}

export const systemMessageService = new SystemMessageService();
