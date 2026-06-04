/**
 * FCM V1 API helper.
 *
 * Reuses the Firebase/Vertex service account key (VERTEX_SERVICE_ACCOUNT_KEY)
 * for OAuth2 authentication. The legacy FCM Server Key API was shut down
 * June 2024 and is no longer available for new projects.
 *
 * Uses VERTEX_PROJECT_ID as the Firebase project ID (same GCP project).
 */

import {
  createVertexAccessToken,
  parseServiceAccountKey,
  type ServiceAccountKey,
} from './vertexAuth.ts';

// ── Token cache ──
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getFcmAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt - now > 120_000) return cachedToken;

  const saKeyBase64 = Deno.env.get('VERTEX_SERVICE_ACCOUNT_KEY');
  if (!saKeyBase64) throw new Error('VERTEX_SERVICE_ACCOUNT_KEY not configured');

  const saKey: ServiceAccountKey = parseServiceAccountKey(saKeyBase64);
  cachedToken = await createVertexAccessToken(saKey);
  tokenExpiresAt = now + 3_500_000; // ~58 min (tokens last 1 hour)
  return cachedToken;
}

// ── Types ──

export interface FcmV1Message {
  notification?: { title: string; body: string };
  data?: Record<string, string>;
  webpush?: {
    notification?: Record<string, string>;
    fcm_options?: { link?: string };
  };
  android?: {
    notification?: Record<string, string>;
  };
  /**
   * iOS/APNs overrides forwarded by FCM. We use this to set the app-icon badge
   * (aps.badge); the title/body still come from the top-level `notification`.
   */
  apns?: {
    payload?: {
      aps?: {
        badge?: number;
        sound?: string;
      };
    };
  };
}

export interface FcmSendResult {
  success: string[];
  failed: string[];
  invalidTokens: string[];
}

// ── Send ──

const BATCH_SIZE = 10;

/**
 * Send push notifications via FCM V1 API.
 * V1 sends one message per request; we fan out in batches of 10.
 */
export async function sendFcmV1(tokens: string[], message: FcmV1Message): Promise<FcmSendResult> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  if (!projectId) {
    console.warn('[fcm-v1] VERTEX_PROJECT_ID not configured, skipping FCM');
    return { success: [], failed: [...tokens], invalidTokens: [] };
  }

  let accessToken: string;
  try {
    accessToken = await getFcmAccessToken();
  } catch (err) {
    console.error('[fcm-v1] Failed to get access token:', err);
    return { success: [], failed: [...tokens], invalidTokens: [] };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const success: string[] = [];
  const failed: string[] = [];
  const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async token => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: { token, ...message } }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return { token, ok: true as const };

        const errorText = await response.text().catch(() => '');
        const isInvalid =
          errorText.includes('UNREGISTERED') ||
          errorText.includes('INVALID_ARGUMENT') ||
          errorText.includes('NOT_FOUND');
        return {
          token,
          ok: false as const,
          invalid: isInvalid,
          error: `${response.status}: ${errorText.substring(0, 200)}`,
        };
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        const v = result.value;
        if (v.ok) {
          success.push(v.token);
        } else {
          failed.push(v.token);
          if (v.invalid) invalidTokens.push(v.token);
          console.warn(`[fcm-v1] Send failed: ${v.error}`);
        }
      } else {
        // Network/timeout failure — count the token as failed
        failed.push(batch[j]);
        console.error('[fcm-v1] Request error:', result.reason);
      }
    }
  }

  console.log(
    `[fcm-v1] Results: ${success.length} sent, ${failed.length} failed, ${invalidTokens.length} invalid`,
  );
  return { success, failed, invalidTokens };
}

/**
 * Convert an arbitrary data object to Record<string, string>
 * as required by FCM V1 API (all values must be strings).
 */
export function toFcmData(data: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}
