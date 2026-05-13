/**
 * OpenAI Realtime browser WebRTC — SDP exchange uses the GA `/realtime/calls` endpoint.
 * @see https://developers.openai.com/api/docs/guides/realtime-webrtc
 */
export const OPENAI_REALTIME_CALLS_SDP_URL = 'https://api.openai.com/v1/realtime/calls';

/**
 * Resolves the URL where the browser POSTs its WebRTC offer (SDP) using the ephemeral token.
 * Server session payloads may later include an explicit override; unknown legacy URLs are ignored.
 */
export function resolveOpenAiRealtimeSdpPostUrl(
  sessionData: Record<string, unknown> | null | undefined,
): string {
  const direct = sessionData?.realtime_calls_url ?? sessionData?.realtime_sdp_url;
  if (typeof direct === 'string' && direct.startsWith('https://')) {
    return direct;
  }
  return OPENAI_REALTIME_CALLS_SDP_URL;
}
