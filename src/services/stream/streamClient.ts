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

let clientInstance: StreamChat | null = null;
let connectionPromise: Promise<void> | null = null;
let isConnecting = false;
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
  return STREAM_API_KEY || null;
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
 * Connect the StreamChat client for the authenticated user.
 * Safe to call multiple times — returns existing connection if active.
 */
export async function connectStreamClient(): Promise<StreamChat | null> {
  if (!STREAM_API_KEY) {
    return null;
  }

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
      const { token, userId, apiKey } = await getStreamToken();
      if (apiKey && apiKey !== STREAM_API_KEY) {
        throw new Error('Stream API key mismatch between client env and stream-token response');
      }

      if (!clientInstance) {
        // Lazy-load the stream-chat SDK (~310 KB) here instead of at module top so it
        // stays out of the authenticated app-shell's static chunk graph. It only loads
        // the first time we actually connect, off the synchronous boot/parse path.
        const { StreamChat } = await import('stream-chat');
        clientInstance = StreamChat.getInstance(STREAM_API_KEY);
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

      await clientInstance.connectUser({ id: userId }, token);
      notifyConnectedSubscribers();
      notifyStatusChangeSubscribers(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (import.meta.env.DEV) {
        console.error('[StreamClient] Connection failed:', msg);
      }
      // Don't throw — Stream is optional, app should work without it
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
