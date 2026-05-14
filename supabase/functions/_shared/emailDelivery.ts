export interface EmailSendResult {
  ok: boolean;
  provider?: 'resend' | 'sendgrid';
  providerMessageId?: string;
  error?: string;
}

export function resolveEmailProviderSecrets(env: {
  RESEND_API_KEY?: string;
  SENDGRID_API_KEY?: string;
}): { provider: 'resend'; apiKey: string } | { provider: 'sendgrid'; apiKey: string } | null {
  if (env.RESEND_API_KEY) {
    return { provider: 'resend', apiKey: env.RESEND_API_KEY };
  }

  if (env.SENDGRID_API_KEY) {
    return { provider: 'sendgrid', apiKey: env.SENDGRID_API_KEY };
  }

  return null;
}
