/**
 * Concierge voice catalog + preference hook.
 * 10 OpenAI voices served via Lovable AI Gateway. Default: coral.
 * Free users are locked to the default; paid users can pick any voice.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';

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
const VALID_IDS = new Set<string>(CONCIERGE_VOICES.map((v) => v.id));

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

export function useConciergeVoicePreference() {
  const { isPaid } = useSubscription();
  const [voice, setVoiceState] = useState<ConciergeVoiceId>(() => readStoredVoice());

  // Free users always get the default voice (don't honor a previously-set choice).
  const effectiveVoice: ConciergeVoiceId = isPaid ? voice : DEFAULT_CONCIERGE_VOICE;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setVoiceState(readStoredVoice());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setVoice = useCallback(
    (next: ConciergeVoiceId) => {
      if (!isPaid) return;
      if (!VALID_IDS.has(next)) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      setVoiceState(next);
    },
    [isPaid],
  );

  return { voice: effectiveVoice, setVoice, isPaid };
}
