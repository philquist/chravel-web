import { describe, expect, it } from 'vitest';
import {
  isRealtimeVoiceEnabled,
  realtimeVoiceDisabledPayload,
  VOICE_PRODUCT_PATH,
} from '../voiceProductPath';

describe('voiceProductPath', () => {
  it('keeps realtime voice disabled unless explicitly enabled', () => {
    expect(isRealtimeVoiceEnabled(undefined)).toBe(false);
    expect(isRealtimeVoiceEnabled('false')).toBe(false);
    expect(isRealtimeVoiceEnabled('true')).toBe(true);
    expect(isRealtimeVoiceEnabled(' TRUE ')).toBe(true);
  });

  it('documents dictation-only as the current product path', () => {
    expect(VOICE_PRODUCT_PATH).toBe('dictation-only');
    expect(realtimeVoiceDisabledPayload()).toEqual({
      error: 'Realtime voice is disabled. Chravel Concierge voice currently supports dictation only.',
      product_path: 'dictation-only',
    });
  });
});
