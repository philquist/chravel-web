import { useTripRealtimeHub } from '@/hooks/useTripRealtimeHub';

interface TripRealtimeHubMountProps {
  tripId: string | undefined;
}

/** Invisible mount point: one multiplexed realtime channel per trip shell. */
export function TripRealtimeHubMount({ tripId }: TripRealtimeHubMountProps) {
  useTripRealtimeHub(tripId);
  return null;
}
