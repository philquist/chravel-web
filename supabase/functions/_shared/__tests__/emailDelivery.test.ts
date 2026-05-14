import { describe, expect, it } from 'vitest';
import { resolveEmailProviderSecrets } from '../emailDelivery.ts';

describe('resolveEmailProviderSecrets', () => {
  it('prefers Resend when both providers are configured', () => {
    expect(
      resolveEmailProviderSecrets({
        RESEND_API_KEY: 're_test',
        SENDGRID_API_KEY: 'sg_test',
      }),
    ).toEqual({ provider: 'resend', apiKey: 're_test' });
  });

  it('falls back to SendGrid when Resend is unavailable', () => {
    expect(resolveEmailProviderSecrets({ SENDGRID_API_KEY: 'sg_test' })).toEqual({
      provider: 'sendgrid',
      apiKey: 'sg_test',
    });
  });

  it('returns null when neither provider is configured', () => {
    expect(resolveEmailProviderSecrets({})).toBeNull();
  });
});
