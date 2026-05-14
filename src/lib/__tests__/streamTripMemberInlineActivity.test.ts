import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncTripMemberToStreamAndEmitMemberJoined,
  syncTripMemberToStreamChannelsOnly,
} from '@/lib/streamTripMemberInlineActivity';

const syncAddMemberToTripChannels = vi.fn();
const reportStreamMembershipSyncFailure = vi.fn();
const memberJoined = vi.fn();

vi.mock('@/services/stream/streamMembershipCoordinator', () => ({
  syncAddMemberToTripChannels: (...args: unknown[]) => syncAddMemberToTripChannels(...args),
  reportStreamMembershipSyncFailure: (...args: unknown[]) =>
    reportStreamMembershipSyncFailure(...args),
}));

vi.mock('@/services/systemMessageService', () => ({
  systemMessageService: {
    memberJoined: (...args: unknown[]) => memberJoined(...args),
  },
}));

describe('streamTripMemberInlineActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncAddMemberToTripChannels.mockResolvedValue(undefined);
  });

  it('syncTripMemberToStreamChannelsOnly calls channel sync only', async () => {
    await syncTripMemberToStreamChannelsOnly({
      tripId: 't1',
      userId: 'u1',
      syncFailureContext: 'test',
    });

    expect(syncAddMemberToTripChannels).toHaveBeenCalledWith('t1', 'u1');
    expect(memberJoined).not.toHaveBeenCalled();
  });

  it('syncTripMemberToStreamAndEmitMemberJoined emits join message by default', async () => {
    await syncTripMemberToStreamAndEmitMemberJoined({
      tripId: 't1',
      joiningUserId: 'u1',
      memberDisplayName: 'Pat',
      syncFailureContext: 'test',
    });

    expect(syncAddMemberToTripChannels).toHaveBeenCalledWith('t1', 'u1');
    expect(memberJoined).toHaveBeenCalledWith('t1', 'Pat', 'u1');
  });

  it('syncTripMemberToStreamAndEmitMemberJoined skips join message when emitMemberJoinedMessage is false', async () => {
    await syncTripMemberToStreamAndEmitMemberJoined({
      tripId: 't1',
      joiningUserId: 'u1',
      memberDisplayName: 'Pat',
      syncFailureContext: 'test',
      emitMemberJoinedMessage: false,
    });

    expect(syncAddMemberToTripChannels).toHaveBeenCalledWith('t1', 'u1');
    expect(memberJoined).not.toHaveBeenCalled();
  });

  it('reports sync failure from channels-only helper', async () => {
    const err = new Error('stream down');
    syncAddMemberToTripChannels.mockRejectedValueOnce(err);

    await expect(
      syncTripMemberToStreamChannelsOnly({
        tripId: 't1',
        userId: 'u1',
        syncFailureContext: 'ctx',
      }),
    ).rejects.toThrow('stream down');

    expect(reportStreamMembershipSyncFailure).toHaveBeenCalledWith(
      'ctx',
      { tripId: 't1', userId: 'u1' },
      err,
    );
  });
});
