/**
 * Voice feature flags — ship-safe hardening layer.
 *
 * Environment-driven flags with safe defaults. Resolved at runtime via
 * import.meta.env (Vite injects at build time; values can be overridden
 * in .env.local for local dev).
 *
 * Voice runtime: provider-selectable (OpenAI default, LiveKit fallback). Vertex AI removed.
 */

type VoiceEnvKey =
  | 'VITE_VOICE_LIVE_ENABLED'
  | 'VITE_VOICE_DIAGNOSTICS_ENABLED'
  | 'VITE_LIVEKIT_WS_URL'
  | 'VITE_AI_VOICE_PROVIDER';

const getEnv = (key: VoiceEnvKey, fallback: string): string => {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
};

const parseBool = (value: string): boolean => value.toLowerCase() === 'true' || value === '1';

/** Voice Live enabled. Default: true — both dictation and LiveKit conversation modes available. */
export const VOICE_LIVE_ENABLED = parseBool(getEnv('VITE_VOICE_LIVE_ENABLED', 'true'));

/** Extra diagnostics (connection codes, audio params) when true. Default: false. */
export const VOICE_DIAGNOSTICS_ENABLED = parseBool(
  getEnv('VITE_VOICE_DIAGNOSTICS_ENABLED', 'false'),
);

/** LiveKit Cloud WebSocket URL. */
export const LIVEKIT_WS_URL = getEnv(
  'VITE_LIVEKIT_WS_URL',
  'wss://chravel-voice-dev-rgxzbtr0.livekit.cloud',
);

/** All voice flags for debugging / diagnostics. */
export function getVoiceFlags(): {
  VOICE_LIVE_ENABLED: boolean;
  VOICE_DIAGNOSTICS_ENABLED: boolean;
  LIVEKIT_WS_URL: string;
} {
  return {
    VOICE_LIVE_ENABLED,
    VOICE_DIAGNOSTICS_ENABLED,
    LIVEKIT_WS_URL,
  };
}

export type VoiceProvider = 'openai' | 'livekit' | 'off';

export const AI_VOICE_PROVIDER = ((): VoiceProvider => {
  const raw = getEnv('VITE_AI_VOICE_PROVIDER', 'openai').toLowerCase();
  if (raw === 'livekit' || raw === 'off') return raw;
  return 'openai';
})();
