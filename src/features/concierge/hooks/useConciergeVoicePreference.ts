/**
 * Concierge voice catalog + preference hook.
 * 10 OpenAI voices served via Lovable AI Gateway. Default: coral.
 * Free users are locked to the default; paid users can pick any voice.
 *
 * Persistence:
 *  - Authoritative source: profiles.concierge_voice (server, cross-device).
 *  - Local cache: localStorage (instant UI; warm before network).
 * On mount, we read localStorage first, then reconcile with the server value.
 * On change, we write both immediately and best-effort upsert to the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';

export const CONCIERGE_VOICES = [
  { id: 'coral', label: 'Coral', description: 'Warm, conversational — recommended' },
  { id: 'alloy', label: 'Alloy', description: 'Balanced, neutral' },
  { id: 'sage', label: 'Sage', description: 'Calm, measured' },
  { id: 'ash', label: 'Ash', description: 'Crisp, professional' },
  { id: 'ballad', label: 'Ballad', description: 'Soft, expressive' },
  { id: 'echo', label: 'Echo', description: 'Mellow, steady' },
  { id: 'shimmer', label: 'Shimmer', description: 'Bright, upbeat' },
  { id: 'verse', label: 'Verse', description: 'Smooth, melodic' },
  { id: 'marin', label: 'Marin', description: 'Friendly, modern' },
  { id: 'cedar', label: 'Cedar', description: 'Rich, grounded' },
] as const;

export type ConciergeVoiceId = (typeof CONCIERGE_VOICES)[number]['id'];

export const DEFAULT_CONCIERGE_VOICE: ConciergeVoiceId = 'coral';
const STORAGE_KEY = 'concierge_voice';
const VALID_IDS = new Set<string>(CONCIERGE_VOICES.map(v => v.id));

function readStoredVoice(): ConciergeVoiceId {
  if (typeof window === 'undefined') return DEFAULT_CONCIERGE_VOICE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_IDS.has(raw)) return raw as ConciergeVoiceId;
  } catch {
    /* ignore */
  }
  return DEFAULT_CONCIERGE_VOICE;
}

function writeStoredVoice(value: ConciergeVoiceId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function useConciergeVoicePreference() {
  const { isPaid } = useSubscription();
  const [voice, setVoiceState] = useState<ConciergeVoiceId>(() => readStoredVoice());

  // Free users always get the default voice (don't honor a previously-set choice).
  const effectiveVoice: ConciergeVoiceId = isPaid ? voice : DEFAULT_CONCIERGE_VOICE;

  // Cross-tab sync via storage events.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setVoiceState(readStoredVoice());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Reconcile with server on mount / auth change + live Realtime updates
  // from other devices so a tap on Device A propagates to Device B instantly.
  useEffect(() => {
    let cancelled = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const applyRemote = (remote: unknown) => {
      if (typeof remote !== 'string' || !VALID_IDS.has(remote)) return;
      if (remote === readStoredVoice()) return;
      writeStoredVoice(remote as ConciergeVoiceId);
      setVoiceState(remote as ConciergeVoiceId);
    };

    const reconcile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from('profiles') as any)
          .select('concierge_voice')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled || error) return;
        const remote = data?.concierge_voice as string | null | undefined;
        if (remote) {
          applyRemote(remote);
        } else {
          const local = readStoredVoice();
          if (local !== DEFAULT_CONCIERGE_VOICE) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('profiles') as any)
              .update({ concierge_voice: local })
              .eq('id', user.id);
          }
        }

        // Subscribe to live profile updates for this user (other devices).
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        realtimeChannel = supabase
          .channel(`concierge-voice:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${user.id}`,
            },
            payload => {
              const next = (payload.new as { concierge_voice?: string } | null)?.concierge_voice;
              applyRemote(next);
            },
          )
          .subscribe();
      } catch {
        /* network failure — keep local */
      }
    };

    reconcile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      reconcile();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, []);

  const setVoice = useCallback(
    async (next: ConciergeVoiceId) => {
      if (!isPaid) return;
      if (!VALID_IDS.has(next)) return;
      writeStoredVoice(next);
      setVoiceState(next);
      // Best-effort server persistence.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('profiles') as any)
          .update({ concierge_voice: next })
          .eq('id', user.id);
      } catch {
        /* ignore — local cache still wins */
      }
    },
    [isPaid],
  );

  return { voice: effectiveVoice, setVoice, isPaid };
}
