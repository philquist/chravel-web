/**
 * Concierge reply-language preference.
 *
 * `null` = Auto-detect (Gemini infers from each user message — current default).
 * Anything else forces the assistant to reply in the chosen language regardless
 * of the input language.
 *
 * Persistence mirrors `useConciergeVoicePreference`:
 *  - Authoritative: profiles.concierge_reply_language (cross-device).
 *  - Local cache: localStorage (instant UI, warm before network).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const CONCIERGE_LANGUAGES = [
  { id: 'auto', label: 'Auto-detect (match user)', bcp47: null },
  { id: 'en', label: 'English', bcp47: 'en-US' },
  { id: 'es', label: 'Español (Spanish)', bcp47: 'es-ES' },
  { id: 'fr', label: 'Français (French)', bcp47: 'fr-FR' },
  { id: 'de', label: 'Deutsch (German)', bcp47: 'de-DE' },
  { id: 'pt', label: 'Português (Portuguese)', bcp47: 'pt-BR' },
  { id: 'it', label: 'Italiano (Italian)', bcp47: 'it-IT' },
  { id: 'ja', label: '日本語 (Japanese)', bcp47: 'ja-JP' },
  { id: 'zh', label: '中文 (Chinese)', bcp47: 'zh-CN' },
  { id: 'ko', label: '한국어 (Korean)', bcp47: 'ko-KR' },
  { id: 'ar', label: 'العربية (Arabic)', bcp47: 'ar-SA' },
] as const;

export type ConciergeLanguageId = (typeof CONCIERGE_LANGUAGES)[number]['id'];

export const DEFAULT_CONCIERGE_LANGUAGE: ConciergeLanguageId = 'auto';
const STORAGE_KEY = 'concierge_reply_language';
const VALID_IDS = new Set<string>(CONCIERGE_LANGUAGES.map(l => l.id));
// DB column is nullable + CHECK constrained to non-'auto' ISO codes.
const DB_VALID = new Set<string>(CONCIERGE_LANGUAGES.filter(l => l.id !== 'auto').map(l => l.id));

function readStored(): ConciergeLanguageId {
  if (typeof window === 'undefined') return DEFAULT_CONCIERGE_LANGUAGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_IDS.has(raw)) return raw as ConciergeLanguageId;
  } catch {
    /* ignore */
  }
  return DEFAULT_CONCIERGE_LANGUAGE;
}

function writeStored(value: ConciergeLanguageId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function useConciergeLanguagePreference() {
  const [language, setLanguageState] = useState<ConciergeLanguageId>(() => readStored());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLanguageState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Reconcile with server on mount / auth change.
  useEffect(() => {
    let cancelled = false;

    const reconcile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from('profiles') as any)
          .select('concierge_reply_language')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled || error) return;
        const remote = data?.concierge_reply_language as string | null | undefined;
        const next: ConciergeLanguageId =
          remote && VALID_IDS.has(remote) ? (remote as ConciergeLanguageId) : 'auto';
        if (next !== readStored()) {
          writeStored(next);
          setLanguageState(next);
        }
      } catch {
        /* network failure — keep local */
      }
    };

    reconcile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => reconcile());
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setLanguage = useCallback(async (next: ConciergeLanguageId) => {
    if (!VALID_IDS.has(next)) return;
    writeStored(next);
    setLanguageState(next);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const dbValue: string | null = next !== 'auto' && DB_VALID.has(next) ? next : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('profiles') as any)
        .update({ concierge_reply_language: dbValue })
        .eq('id', user.id);
    } catch {
      /* ignore — local cache still wins */
    }
  }, []);

  const entry = CONCIERGE_LANGUAGES.find(l => l.id === language) ?? CONCIERGE_LANGUAGES[0];

  return {
    language,
    setLanguage,
    /** BCP-47 tag for Web Speech dictation, or null if auto-detect. */
    bcp47: entry.bcp47,
    /** ISO short code for prompt directive, or null if auto-detect. */
    isoCode: language === 'auto' ? null : language,
  };
}
