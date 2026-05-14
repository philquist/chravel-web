import {
  reportStreamMembershipSyncFailure,
  syncAddMemberToTripChannels,
} from '@/services/stream/streamMembershipCoordinator';
import { systemMessageService } from '@/services/systemMessageService';

/**
 * Ensure a user is on Stream trip channels (trip + broadcast). Does not emit
 * inline chat activity — used for membership repair (creator backfill, etc.).
 */
export async function syncTripMemberToStreamChannelsOnly(params: {
  tripId: string;
  userId: string;
  syncFailureContext: string;
}): Promise<void> {
  const { tripId, userId, syncFailureContext } = params;
  try {
    await syncAddMemberToTripChannels(tripId, userId);
  } catch (error) {
    reportStreamMembershipSyncFailure(syncFailureContext, { tripId, userId }, error);
    throw error;
  }
}

/**
 * After a user becomes a trip member, ensure they are on Stream trip channels
 * and emit the standard "joined the trip" inline system message.
 *
 * Stream is the canonical chat transport; Postgres `trip_chat_messages` rows
 * from legacy triggers are not shown in trip chat.
 */
export async function syncTripMemberToStreamAndEmitMemberJoined(params: {
  tripId: string;
  joiningUserId: string;
  memberDisplayName: string;
  /** Telemetry / logging context when Stream membership sync fails */
  syncFailureContext: string;
  /**
   * When false, syncs Stream channel membership only — no “joined” inline message.
   * Use when Postgres already had an active membership row (INSERT was a no-op).
   */
  emitMemberJoinedMessage?: boolean;
}): Promise<void> {
  const {
    tripId,
    joiningUserId,
    memberDisplayName,
    syncFailureContext,
    emitMemberJoinedMessage = true,
  } = params;

  await syncTripMemberToStreamChannelsOnly({
    tripId,
    userId: joiningUserId,
    syncFailureContext,
  });

  if (!emitMemberJoinedMessage) {
    return;
  }

  await systemMessageService.memberJoined(tripId, memberDisplayName, joiningUserId);
}
