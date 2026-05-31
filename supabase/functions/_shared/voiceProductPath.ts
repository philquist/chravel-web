export const VOICE_PRODUCT_PATH = 'dictation-only' as const;

export function isRealtimeVoiceEnabled(flagValue: string | undefined | null): boolean {
  return flagValue?.trim().toLowerCase() === 'true';
}

export function realtimeVoiceDisabledPayload(): { error: string; product_path: typeof VOICE_PRODUCT_PATH } {
  return {
    error: 'Realtime voice is disabled. Chravel Concierge voice currently supports dictation only.',
    product_path: VOICE_PRODUCT_PATH,
  };
}
