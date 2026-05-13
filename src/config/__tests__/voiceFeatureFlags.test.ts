import { afterEach, describe, expect, it, vi } from 'vitest';

const loadModule = async () => import('../voiceFeatureFlags');

describe('AI_VOICE_PROVIDER defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to openai when env is unset', async () => {
    vi.stubEnv('VITE_AI_VOICE_PROVIDER', undefined);
    const mod = await loadModule();
    expect(mod.AI_VOICE_PROVIDER).toBe('openai');
  });

  it('accepts explicit openai override', async () => {
    vi.stubEnv('VITE_AI_VOICE_PROVIDER', 'openai');
    const mod = await loadModule();
    expect(mod.AI_VOICE_PROVIDER).toBe('openai');
  });
});
