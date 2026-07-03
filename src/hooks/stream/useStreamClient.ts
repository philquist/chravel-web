/**
 * useStreamClient — React hook for Stream client lifecycle
 *
 * Connects the Stream client whenever Stream is configured and user is authenticated.
 * Disconnects on logout. Returns connection status.
 *
 * Mount this once at the app shell level (e.g. AppInitializer).
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { connectStreamClient, disconnectStreamClient } from '@/services/stream/streamClient';

interface UseStreamClientResult {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useStreamClient(): UseStreamClientResult {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    let cancelled = false;

    const connect = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        const client = await connectStreamClient();
        if (!cancelled) {
          const connected = !!client?.userID;
          setIsConnected(connected);
          if (!connected) {
            setError('Stream connection unavailable. Chat may be degraded.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Stream connection failed';
          setError(msg);
          setIsConnected(false);
        }
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  // Disconnect on unmount / logout
  useEffect(() => {
    if (!isAuthenticated) {
      setIsConnected(false);
      disconnectStreamClient();
    }
  }, [isAuthenticated]);

  return { isConnected, isConnecting, error };
}
