/**
 * Poll deep-link helpers — Concierge / chat → Polls tab.
 *
 * Storage is trip-scoped and consumed once by CommentsWall so create-form /
 * focus-poll intents survive the tab switch.
 */

export const POLL_DEEP_LINK_EVENT = 'chravel:poll-deeplink';

export interface PollDeepLink {
  tripId: string;
  pollId?: string;
  createPoll?: boolean;
}

const storageKey = (tripId: string): string => `trip_${tripId}_pollDeepLink`;

export function setPollDeepLink(tripId: string, link: Omit<PollDeepLink, 'tripId'>): void {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    sessionStorage.setItem(storageKey(tripId), JSON.stringify(link));
  } catch {
    // Best-effort only (private mode / quota).
  }
}

export function consumePollDeepLink(tripId: string): Omit<PollDeepLink, 'tripId'> | null {
  if (typeof window === 'undefined' || !tripId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(tripId));
    if (!raw) return null;
    sessionStorage.removeItem(storageKey(tripId));
    const parsed = JSON.parse(raw) as { pollId?: string; createPoll?: boolean };
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      pollId: typeof parsed.pollId === 'string' ? parsed.pollId : undefined,
      createPoll: parsed.createPoll === true,
    };
  } catch {
    return null;
  }
}

export function peekPollDeepLink(tripId: string): Omit<PollDeepLink, 'tripId'> | null {
  if (typeof window === 'undefined' || !tripId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pollId?: string; createPoll?: boolean };
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      pollId: typeof parsed.pollId === 'string' ? parsed.pollId : undefined,
      createPoll: parsed.createPoll === true,
    };
  } catch {
    return null;
  }
}

export function parsePollDeepLinkFromSearch(search: string): Omit<PollDeepLink, 'tripId'> | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const pollId = params.get('pollId') || undefined;
  const createPoll = params.get('createPoll') === '1' || params.get('createPoll') === 'true';
  if (!pollId && !createPoll) return null;
  return { pollId, createPoll };
}

/** Persist intent and notify trip shells to switch to the Polls tab. */
export function requestPollDeepLink(tripId: string, link: Omit<PollDeepLink, 'tripId'>): void {
  if (!tripId) return;
  setPollDeepLink(tripId, link);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PollDeepLink>(POLL_DEEP_LINK_EVENT, {
      detail: { tripId, ...link },
    }),
  );
}
