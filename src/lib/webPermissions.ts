/**
 * Permission status + request helpers for the Permissions Center.
 *
 * - **Web:** Permissions API, Notification, geolocation, getUserMedia.
 * - **Installed native shells (Capacitor):** optional `window.Capacitor.Plugins` bridges
 *   when the native app registers standard plugins — no `@capacitor/*` npm dependency.
 * - **ChravelNative (Expo shell):** optional `openAppSettings` / `openNotificationSettings`
 *   on `window.ChravelNative` (see `src/utils/nativeBridge.ts` contract).
 */

import { isInstalledApp } from '@/utils/platformDetection';

export type PermissionId = 'notifications' | 'location' | 'microphone' | 'camera';

export type PermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unknown'
  | 'unavailable'
  | 'not_applicable';

export interface PermissionStatus {
  id: PermissionId;
  state: PermissionState;
  canRequest: boolean;
  canOpenSettings: boolean;
  detail?: string;
}

type CapacitorPlugins = Record<string, unknown> | undefined;

type PushReceiveStatus = { receive?: string };
type PushNotificationsPlugin = {
  checkPermissions: () => Promise<PushReceiveStatus>;
  requestPermissions: () => Promise<PushReceiveStatus>;
  register: () => Promise<void>;
};

type GeolocationCapStatus = { location?: string };
type GeolocationPlugin = {
  checkPermissions: () => Promise<GeolocationCapStatus>;
  requestPermissions: () => Promise<GeolocationCapStatus>;
};

type CameraCapStatus = { camera?: string };
type CameraPlugin = {
  checkPermissions: () => Promise<CameraCapStatus>;
  requestPermissions: () => Promise<CameraCapStatus>;
};

type AppPlugin = {
  openUrl: (options: { url: string }) => Promise<void>;
};

type ChravelNativePermissionsBridge = {
  openAppSettings?: () => void | Promise<void>;
  /** Optional: deep-link to this app’s notification settings on iOS when supported by the shell. */
  openNotificationSettings?: () => void | Promise<void>;
};

function getCapacitorPlugins(): CapacitorPlugins {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
}

function getPushNotificationsPlugin(): PushNotificationsPlugin | null {
  const raw = getCapacitorPlugins()?.PushNotifications;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as PushNotificationsPlugin;
  if (typeof p.checkPermissions !== 'function' || typeof p.requestPermissions !== 'function') {
    return null;
  }
  return p;
}

function getGeolocationPlugin(): GeolocationPlugin | null {
  const raw = getCapacitorPlugins()?.Geolocation;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as GeolocationPlugin;
  if (typeof p.checkPermissions !== 'function' || typeof p.requestPermissions !== 'function') {
    return null;
  }
  return p;
}

function getCameraPlugin(): CameraPlugin | null {
  const raw = getCapacitorPlugins()?.Camera;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as CameraPlugin;
  if (typeof p.checkPermissions !== 'function' || typeof p.requestPermissions !== 'function') {
    return null;
  }
  return p;
}

function getAppPlugin(): AppPlugin | null {
  const raw = getCapacitorPlugins()?.App;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as AppPlugin;
  return typeof p.openUrl === 'function' ? p : null;
}

function getChravelNativeBridge(): ChravelNativePermissionsBridge | null {
  if (typeof window === 'undefined') return null;
  const cn = (window as unknown as { ChravelNative?: ChravelNativePermissionsBridge })
    .ChravelNative;
  return cn ?? null;
}

/** Map Capacitor permission strings to our PermissionState. */
function mapCapacitorField(state: string | undefined): PermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  if (state === 'prompt' || state === 'prompt-with-rationale') return 'prompt';
  if (state === 'limited') return 'granted';
  return 'unknown';
}

function installedCanOpenSettings(): boolean {
  return isInstalledApp();
}

function normalizePermissionState(state: unknown): PermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  if (state === 'prompt') return 'prompt';
  return 'unknown';
}

async function queryBrowserPermission(name: string): Promise<PermissionState> {
  const permissions = (navigator as unknown as { permissions?: Permissions }).permissions;
  if (!permissions?.query) return 'unknown';

  try {
    const result = await permissions.query({ name: name as PermissionName });
    return normalizePermissionState(result.state);
  } catch {
    return 'unknown';
  }
}

async function requestGeolocationPermission(): Promise<PermissionState> {
  const geo = getGeolocationPlugin();
  if (geo) {
    try {
      const { location } = await geo.requestPermissions();
      return mapCapacitorField(location);
    } catch {
      /* fall through */
    }
  }

  if (!('geolocation' in navigator)) return 'unavailable';

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err: GeolocationPositionError) => {
        if (err.code === 1) resolve('denied');
        else resolve('unknown');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function requestMediaPermission(constraint: 'audio' | 'video'): Promise<PermissionState> {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) return 'unavailable';

  try {
    const stream = await mediaDevices.getUserMedia(
      constraint === 'audio' ? { audio: true } : { video: true },
    );
    stream.getTracks().forEach(track => track.stop());
    return 'granted';
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'denied';
      if (error.name === 'NotFoundError') return 'unavailable';
    }
    return 'unknown';
  }
}

async function requestCameraPermission(): Promise<PermissionState> {
  const cam = getCameraPlugin();
  if (cam) {
    try {
      const { camera } = await cam.requestPermissions();
      const mapped = mapCapacitorField(camera);
      if (mapped !== 'unknown') return mapped;
    } catch {
      /* fall through */
    }
  }
  return requestMediaPermission('video');
}

/**
 * Opens the native app settings (or best-effort notification settings).
 * Returns true when a native handler ran; false on plain web with no bridge.
 */
export async function openAppSettings(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const cn = getChravelNativeBridge();
  if (typeof cn?.openAppSettings === 'function') {
    await Promise.resolve(cn.openAppSettings());
    return true;
  }

  const app = getAppPlugin();
  if (app) {
    try {
      await app.openUrl({ url: 'app-settings:' });
      return true;
    } catch {
      /* try notification-specific deep link below */
    }
  }

  if (typeof cn?.openNotificationSettings === 'function') {
    await Promise.resolve(cn.openNotificationSettings());
    return true;
  }

  return false;
}

/** Opens notification-focused settings when the shell supports it; otherwise `openAppSettings`. */
export async function openNotificationSettingsIfAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cn = getChravelNativeBridge();
  if (typeof cn?.openNotificationSettings === 'function') {
    await Promise.resolve(cn.openNotificationSettings());
    return true;
  }
  return openAppSettings();
}

export async function getPermissionStatus(id: PermissionId): Promise<PermissionStatus> {
  const canOpenSettings = installedCanOpenSettings();

  switch (id) {
    case 'notifications': {
      const push = getPushNotificationsPlugin();
      if (push) {
        try {
          const { receive } = await push.checkPermissions();
          const state = mapCapacitorField(receive);
          return {
            id,
            state,
            canRequest: state === 'prompt' || state === 'unknown',
            canOpenSettings,
          };
        } catch {
          /* fall through to web */
        }
      }

      if (!('Notification' in window)) {
        return { id, state: 'unavailable', canRequest: false, canOpenSettings };
      }
      const perm = Notification.permission;
      const state: PermissionState =
        perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'prompt';
      return {
        id,
        state,
        canRequest: state === 'prompt',
        canOpenSettings,
      };
    }

    case 'location': {
      const geo = getGeolocationPlugin();
      if (geo) {
        try {
          const { location } = await geo.checkPermissions();
          const state = mapCapacitorField(location);
          return {
            id,
            state,
            canRequest: state === 'prompt' || state === 'unknown',
            canOpenSettings,
          };
        } catch {
          /* fall through */
        }
      }

      const state = await queryBrowserPermission('geolocation');
      return {
        id,
        state,
        canRequest: state === 'prompt' || state === 'unknown',
        canOpenSettings,
      };
    }

    case 'camera': {
      const cam = getCameraPlugin();
      if (cam) {
        try {
          const { camera } = await cam.checkPermissions();
          const state = mapCapacitorField(camera);
          return {
            id,
            state,
            canRequest: state === 'prompt' || state === 'unknown',
            canOpenSettings,
          };
        } catch {
          /* fall through */
        }
      }

      const state = await queryBrowserPermission('camera');
      return {
        id,
        state,
        canRequest: state === 'prompt' || state === 'unknown',
        canOpenSettings,
      };
    }

    case 'microphone': {
      const state = await queryBrowserPermission('microphone');
      return {
        id,
        state,
        canRequest: state === 'prompt' || state === 'unknown',
        canOpenSettings,
      };
    }

    default: {
      const exhaustiveCheck: never = id;
      return { id: exhaustiveCheck, state: 'unknown', canRequest: false, canOpenSettings };
    }
  }
}

export async function requestPermission(id: PermissionId): Promise<PermissionState> {
  switch (id) {
    case 'notifications': {
      const push = getPushNotificationsPlugin();
      if (push) {
        try {
          const { receive } = await push.requestPermissions();
          const state = mapCapacitorField(receive);
          if (state === 'granted') {
            try {
              await push.register();
            } catch {
              /* register is best-effort; permission is still granted */
            }
          }
          return state;
        } catch {
          /* fall through */
        }
      }

      if (!('Notification' in window)) return 'unavailable';
      const result = await Notification.requestPermission();
      return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
    }
    case 'location':
      return requestGeolocationPermission();
    case 'camera':
      return requestCameraPermission();
    case 'microphone':
      return requestMediaPermission('audio');
    default: {
      const exhaustiveCheck: never = id;
      return exhaustiveCheck;
    }
  }
}
