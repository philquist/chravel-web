/**
 * Stream Chat Client — Singleton
 *
 * Manages a single StreamChat instance for the application.
 * Connects on login, disconnects on logout.
 *
 * Usage:
 *   import { connectStreamClient, disconnectStreamClient, getStreamClient } from '@/services/stream/streamClient';
 *
 * Architecture:
 *   - Uses stream-chat JS client (low-level, no UI components)
 *   - Token fetched from stream-token edge function
 *   - User profile synced to Stream on connect
 *   - Disconnects cleanly on logout via Supabase auth listener
 */

import type { StreamChat } from 'stream-chat';
import { supabase } from '@/integrations/supabase/client';
import { getStreamToken, clearStreamTokenCache } from './streamTokenService';

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || '';

/** Bounded retry for the initial connect (token fetch + connectUser). */
const MAX_CONNECT_ATTEMPTS = 3;
/** Backoff before attempts 2 and 3 (ms). */
const CONNECT_BACKOFF_MS = [1000, 3000];

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

let clientInstance: StreamChat | null = null;
let connectionPromise: Promise<void> | null = null;
let isConnecting = false;
let runtimeStreamApiKey: string | null = null;
const connectedSubscribers = new Set<() => void>();
const statusChangeSubscribers = new Set<(isConnected: boolean) => void>();
let connectionChangedListenerAttached = false;

const notifyConnectedSubscribers = () => {
  connectedSubscribers.forEach(callback => {
    callback();
  });
};

const notifyStatusChangeSubscribers = (isConnected: boolean) => {
  statusChangeSubscribers.forEach(callback => {
    callback(isConnected);
  });
};

/**
 * Get the Stream API key from environment.
 * Returns null if not configured (Stream migration not active).
 */
export function getStreamApiKey(): string | null {
  return STREAM_API_KEY || runtimeStreamApiKey || null;
}

/**
 * Get the StreamChat client instance.
 * Returns null if not initialized or Stream is not configured.
 */
export function getStreamClient(): StreamChat | null {
  return clientInstance;
}

/**
 * Subscribe to Stream connection-ready events.
 * Callback is invoked whenever Stream is connected (initial connect + reconnect).
 */
export function onStreamClientConnected(callback: () => void): () => void {
  connectedSubscribers.add(callback);

  return () => {
    connectedSubscribers.delete(callback);
  };
}

/**
 * Subscribe to Stream connection status changes (both connect and disconnect).
 * Callback receives `true` when connected, `false` when disconnected.
 */
export function onStreamClientConnectionStatusChange(
  callback: (isConnected: boolean) => void,
): () => void {
  statusChangeSubscribers.add(callback);

  return () => {
    statusChangeSubscribers.delete(callback);
  };
}

/**
 * One connection attempt: resolve the token/api key, lazy-load and instantiate
 * the SDK if needed, and connectUser with a refreshing tokenProvider. Throws on
 * failure so the caller's bounded retry can catch and back off.
 */
async function establishConnection(): Promise<void> {
  const { userId, apiKey } = await getStreamToken();
  const resolvedApiKey = STREAM_API_KEY || apiKey;

  if (!resolvedApiKey) {
    throw new Error('Stream API key missing from client env and stream-token response');
  }

  if (STREAM_API_KEY && apiKey && apiKey !== STREAM_API_KEY) {
    throw new Error('Stream API key mismatch between client env and stream-token response');
  }

  runtimeStreamApiKey = resolvedApiKey;

  if (!clientInstance) {
    // Lazy-load the stream-chat SDK (~310 KB) here instead of at module top so it
    // stays out of the authenticated app-shell's static chunk graph. It only loads
    // the first time we actually connect, off the synchronous boot/parse path.
    const { StreamChat } = await import('stream-chat');
    clientInstance = StreamChat.getInstance(resolvedApiKey);
    if (!connectionChangedListenerAttached) {
      clientInstance.on('connection.changed', event => {
        notifyStatusChangeSubscribers(!!event.online);
        if (event.online) {
          notifyConnectedSubscribers();
        }
      });
      connectionChangedListenerAttached = true;
    }
  }

  // Pass a tokenProvider (not a static token string) so Stream can refresh
  // the token itself on reconnect / expiry. Stream user tokens expire at 24h;
  // a static token would leave a long-lived or backgrounded session unable to
  // re-authenticate on the next reconnect. The provider hits getStreamToken's
  // cache (just populated above) on the initial call and only refetches once
  // the 20h TTL lapses — well before the 24h server expiry.
  await clientInstance.connectUser({ id: userId }, async () => {
    const refreshed = await getStreamToken();
    return refreshed.token;
  });
  notifyConnectedSubscribers();
  notifyStatusChangeSubscribers(true);
}

/**
 * Connect the StreamChat client for the authenticated user.
 * Safe to call multiple times — returns existing connection if active.
 */
export async function connectStreamClient(): Promise<StreamChat | null> {
  // Already connected
  if (clientInstance?.userID) {
    return clientInstance;
  }

  // Connection already in progress — wait for it
  if (isConnecting && connectionPromise) {
    await connectionPromise;
    return clientInstance;
  }

  isConnecting = true;
  connectionPromise = (async () => {
    try {
      // Bounded retry: a transient token-fetch or connect failure (cold edge
      // function, network blip on app launch) used to leave chat permanently
      // dead until a full reload, since the error was swallowed with no retry.
      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        try {
          await establishConnection();
          return;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          if (import.meta.env.DEV) {
            console.error(
              `[StreamClient] Connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed:`,
              msg,
            );
          }
          // A stale cached token can poison every retry — drop it so the next
          // attempt re-mints from the edge function.
          clearStreamTokenCache();
          if (attempt < MAX_CONNECT_ATTEMPTS) {
            await delay(CONNECT_BACKOFF_MS[attempt - 1]);
          }
          // Final attempt: fall through. Don't throw — Stream is optional, the
          // app should still work without it.
        }
      }
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  })();

  await connectionPromise;
  return clientInstance;
}

/**
 * Disconnect the StreamChat client.
 * Called on logout.
 */
export async function disconnectStreamClient(): Promise<void> {
  clearStreamTokenCache();

  if (clientInstance) {
    try {
      await clientInstance.disconnectUser();
    } catch {
      // Ignore disconnect errors
    }
    clientInstance = null;
    connectionChangedListenerAttached = false;
  }
}

// ── Auto-disconnect on Supabase logout ────────────────────────────────────
if (typeof supabase.auth?.onAuthStateChange === 'function') {
  supabase.auth.onAuthStateChange((eventOrPayload, _session) => {
    const authEvent =
      typeof eventOrPayload === 'string'
        ? eventOrPayload
        : (eventOrPayload as { event?: string } | null)?.event;

    if (authEvent === 'SIGNED_OUT') {
      void disconnectStreamClient();
    }
  });
}
