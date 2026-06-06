import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useWebPush } from '@/hooks/useWebPush';
import { useNativePush } from '@/hooks/useNativePush';

type Status = 'ok' | 'warn' | 'bad';

function Row({ status, label }: { status: Status; label: string }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'warn' ? AlertTriangle : XCircle;
  const color =
    status === 'ok' ? 'text-green-400' : status === 'warn' ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className={color} />
      <span className="text-gray-300">{label}</span>
    </div>
  );
}

/**
 * Surfaces why push is or isn't deliverable on THIS device.
 * Native shells use APNs/FCM; web/PWA uses Web Push + VAPID.
 */
export const PushDiagnostics: React.FC = () => {
  const {
    isNative,
    permission: nativePermission,
    isRegistered,
    error: nativeError,
  } = useNativePush();
  const {
    isSupported,
    permission: webPermission,
    isSubscribed,
    requiresHomeScreen,
    iosUnsupported,
    vapidConfigured,
  } = useWebPush();

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Push status (this device)
      </p>

      {isNative ? (
        <>
          <Row status="ok" label="Native app push (APNs / FCM)" />
          <Row
            status={
              nativePermission === 'granted' ? 'ok' : nativePermission === 'denied' ? 'bad' : 'warn'
            }
            label={`Notification permission: ${nativePermission}`}
          />
          <Row
            status={isRegistered ? 'ok' : 'warn'}
            label={
              isRegistered ? 'Device registered for push' : 'Not registered yet — toggle push ON'
            }
          />
          {nativeError ? <Row status="bad" label={nativeError} /> : null}
        </>
      ) : (
        <>
          {iosUnsupported ? (
            <Row status="bad" label="iOS version too old for web push (needs iOS 16.4+)" />
          ) : requiresHomeScreen ? (
            <Row status="warn" label="Add to Home Screen to enable push on iOS" />
          ) : isSupported ? (
            <Row status="ok" label="Push supported on this browser" />
          ) : (
            <Row status="bad" label="Push not supported on this browser" />
          )}

          <Row
            status={
              webPermission === 'granted' ? 'ok' : webPermission === 'denied' ? 'bad' : 'warn'
            }
            label={`Notification permission: ${webPermission}`}
          />
          <Row
            status={isSubscribed ? 'ok' : 'warn'}
            label={isSubscribed ? 'Subscribed to push' : 'Not subscribed yet'}
          />
          <Row
            status={vapidConfigured ? 'ok' : 'bad'}
            label={vapidConfigured ? 'Push keys configured' : 'Push keys not configured (VAPID)'}
          />
        </>
      )}
    </div>
  );
};

export default PushDiagnostics;
