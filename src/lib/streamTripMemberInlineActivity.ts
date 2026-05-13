import {
  reportStreamMembershipSyncFailure,
  syncAddMemberToTripChannels,
} from '@/services/stream/streamMembershipCoordinator';
import { systemMessageService } from '@/services/systemMessageService';

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
}): Promise<void> {
  const { tripId, joiningUserId, memberDisplayName, syncFailureContext } = params;

  try {
    await syncAddMemberToTripChannels(tripId, joiningUserId);
  } catch (error) {
    reportStreamMembershipSyncFailure(syncFailureContext, { tripId, userId: joiningUserId }, error);
    throw error;
  }

  await systemMessageService.memberJoined(tripId, memberDisplayName, joiningUserId);
}
