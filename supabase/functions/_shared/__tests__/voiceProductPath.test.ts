import { describe, expect, it } from 'vitest';
import {
  realtimeVoiceDisabledPayload,
  VOICE_PRODUCT_PATH,
} from '../voiceProductPath';

describe('voiceProductPath', () => {
  it('documents dictation-only as the current product path', () => {
    expect(VOICE_PRODUCT_PATH).toBe('dictation-only');
    expect(realtimeVoiceDisabledPayload()).toEqual({
      error: 'Realtime voice is disabled. Chravel Concierge voice currently supports dictation only.',
      product_path: 'dictation-only',
    });
  });
});
