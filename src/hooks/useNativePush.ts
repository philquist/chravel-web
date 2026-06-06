/**
 * Native Push Notifications Hook
 *
 * Uses the injected Capacitor PushNotifications plugin (no npm dependency) when
 * running inside chravel-mobile or Capacitor shells. Web/PWA continues to use
 * useWebPush + VAPID.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import {
  checkNativePushPermissions,
  isNativePushAvailable,
  registerNativePushToken,
  requestNativePushPermissions,
  unregisterNativePush,
  detectNativePushPlatform,
} from '@/lib/nativePushBridge';
import { saveDeviceToken, removeDeviceToken, updateLastSeen } from '@/services/pushTokenService';

export interface NativePushState {
  token: string | null;
  permission: 'granted' | 'denied' | 'prompt';
  isNative: boolean;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useNativePush() {
  const { user } = useAuth();
  const isNative = isNativePushAvailable();
  const tokenRef = useRef<string | null>(null);

  const [state, setState] = useState<NativePushState>({
    token: null,
    permission: 'prompt',
    isNative,
    isRegistered: false,
    isLoading: false,
    error: null,
  });

  const checkPermission = useCallback(async (): Promise<'granted' | 'denied' | 'prompt'> => {
    if (!isNative) return 'denied';
    const permission = await checkNativePushPermissions();
    setState(prev => ({ ...prev, permission }));
    return permission;
  }, [isNative]);

  const registerForPush = useCallback(async (): Promise<string | null> => {
    if (!isNative || !user) return null;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let permission = await checkNativePushPermissions();
      if (permission !== 'granted') {
        permission = await requestNativePushPermissions();
      }
      setState(prev => ({ ...prev, permission }));

      if (permission !== 'granted') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Permission not granted',
        }));
        return null;
      }

      const result = await registerNativePushToken();
      if (result.error || !result.token) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to get device token',
        }));
        return null;
      }

      const platform = detectNativePushPlatform();
      const saved = await saveDeviceToken(user.id, result.token, platform);
      if (!saved) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to save device token',
        }));
        return null;
      }

      tokenRef.current = result.token;
      setState(prev => ({
        ...prev,
        token: result.token,
        isRegistered: true,
        isLoading: false,
        error: null,
      }));
      return result.token;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return null;
    }
  }, [isNative, user]);

  const unregisterFromPush = useCallback(async (): Promise<void> => {
    if (!user || !tokenRef.current) return;

    try {
      await removeDeviceToken(user.id, tokenRef.current);
      await unregisterNativePush();
      tokenRef.current = null;
      setState(prev => ({
        ...prev,
        token: null,
        isRegistered: false,
      }));
    } catch {
      // best-effort
    }
  }, [user]);

  const clearNotifications = useCallback(async (): Promise<void> => {
    await unregisterNativePush();
  }, []);

  useEffect(() => {
    if (!isNative) return;
    void checkPermission();
  }, [isNative, checkPermission]);

  useEffect(() => {
    if (!user || !tokenRef.current) return;

    void updateLastSeen(user.id, tokenRef.current);
    const interval = setInterval(
      () => {
        if (tokenRef.current) {
          void updateLastSeen(user.id, tokenRef.current);
        }
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [user]);

  return {
    ...state,
    registerForPush,
    unregisterFromPush,
    checkPermission,
    clearNotifications,
  };
}
