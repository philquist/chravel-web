import { test } from '@playwright/test';

export const isReleaseGateE2E = process.env.CHRAVEL_E2E_RELEASE_GATE === '1';

export function fixtureStepError(step: string, detail: string): Error {
  return new Error(`[E2E fixture step failed: ${step}] ${detail}`);
}

export function skipLocallyOrFailRelease(step: string, localReason: string): void {
  if (isReleaseGateE2E) {
    throw fixtureStepError(step, localReason);
  }

  test.skip(true, `[local-tolerant] ${step}: ${localReason}`);
}

export function requireE2EEnv(step: string, values: Record<string, string | undefined>): void {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length === 0) return;

  const message = `Missing required environment variable(s): ${missing.join(', ')}`;
  if (isReleaseGateE2E) {
    throw fixtureStepError(step, message);
  }

  console.warn(`[E2E Fixtures] ${message} — local-tolerant fixtures may skip.`);
}
