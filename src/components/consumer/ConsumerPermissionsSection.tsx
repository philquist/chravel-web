import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  MapPin,
  Mic,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import {
  getPermissionStatus,
  openAppSettings,
  openNotificationSettingsIfAvailable,
  requestPermission,
  type PermissionId,
  type PermissionState,
  type PermissionStatus,
} from '@/lib/webPermissions';
import { isInstalledApp } from '@/utils/platformDetection';

type BrowserKind = 'chrome' | 'edge' | 'safari' | 'firefox' | 'opera' | 'other';

function detectBrowser(): BrowserKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

function getBrowserInstructions(browser: BrowserKind, permission: PermissionId): string[] {
  const label =
    permission === 'notifications'
      ? 'Notifications'
      : permission === 'location'
        ? 'Location'
        : permission === 'camera'
          ? 'Camera'
          : 'Microphone';
  switch (browser) {
    case 'chrome':
    case 'edge':
    case 'opera':
      return [
        'Click the lock or tune icon to the left of the address bar.',
        `Find "${label}" in the site permissions list.`,
        'Change it to "Allow", then reload this page.',
      ];
    case 'safari':
      return [
        'Open Safari → Settings → Websites.',
        `Choose "${label}" in the left sidebar.`,
        'Set this site to "Allow", then reload this page.',
      ];
    case 'firefox':
      return [
        'Click the lock icon to the left of the address bar.',
        `Find "${label}" under permissions and remove the blocked status.`,
        'Reload this page and allow when prompted.',
      ];
    default:
      return [
        'Open your browser settings for this site.',
        `Allow "${label}" access, then reload this page.`,
      ];
  }
}

function formatState(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'prompt':
      return 'Not requested yet';
    case 'unknown':
      return 'Unknown';
    case 'unavailable':
      return 'Unavailable';
    case 'not_applicable':
      return 'Not used';
    default: {
      const exhaustiveCheck: never = state;
      return exhaustiveCheck;
    }
  }
}

function badgeClasses(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'denied':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'prompt':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'unknown':
      return 'bg-gray-500/15 text-gray-300 border-gray-500/30';
    case 'unavailable':
      return 'bg-gray-700/30 text-gray-400 border-gray-600/40';
    case 'not_applicable':
      return 'bg-gray-700/30 text-gray-400 border-gray-600/40';
    default: {
      const exhaustiveCheck: never = state;
      return exhaustiveCheck;
    }
  }
}

interface PermissionCardConfig {
  id: PermissionId;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export const ConsumerPermissionsSection = () => {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<PermissionId, PermissionStatus> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<PermissionId | null>(null);
  const [expandedHelp, setExpandedHelp] = useState<PermissionId | null>(null);
  const browser = useMemo(detectBrowser, []);
  const installed = useMemo(isInstalledApp, []);

  const cards: PermissionCardConfig[] = useMemo(
    () => [
      {
        id: 'notifications',
        title: 'Notifications',
        description:
          'Used for trip updates, chat messages, broadcasts, and reminders so you do not miss important moments when the app is closed.',
        icon: <Bell size={18} className="text-primary" />,
      },
      {
        id: 'location',
        title: 'Location',
        description:
          'Used only when you turn on location sharing (e.g., coordinating meetups and tracking trip movement).',
        icon: <MapPin size={18} className="text-pink-300" />,
      },
      {
        id: 'camera',
        title: 'Camera',
        description:
          'Used when you take photos or scan documents within trips. Requested just-in-time when needed.',
        icon: <Camera size={18} className="text-emerald-300" />,
      },
      {
        id: 'microphone',
        title: 'Microphone',
        description:
          'Used for AI Concierge voice conversations when you tap the mic button in chat.',
        icon: <Mic size={18} className="text-indigo-300" />,
      },
    ],
    [],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const entries = await Promise.all(
        cards.map(async c => {
          const status = await getPermissionStatus(c.id);
          return [c.id, status] as const;
        }),
      );

      const next: Record<PermissionId, PermissionStatus> = entries.reduce(
        (acc, [id, status]) => {
          acc[id] = status;
          return acc;
        },
        {} as Record<PermissionId, PermissionStatus>,
      );

      setStatuses(next);
    } finally {
      setIsRefreshing(false);
    }
  }, [cards]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpenSettings = useCallback(async () => {
    const opened = await openAppSettings();
    if (!opened) {
      toast({
        title: 'Unable to open Settings',
        description:
          'Open the Settings app on your device, find ChravelApp, and adjust permissions there.',
      });
    }
  }, [toast]);

  const handleOpenNotificationSettings = useCallback(async () => {
    const opened = await openNotificationSettingsIfAvailable();
    if (!opened) {
      await handleOpenSettings();
    }
  }, [handleOpenSettings]);

  const handleRequest = useCallback(
    async (id: PermissionId) => {
      setBusyId(id);
      try {
        const result = await requestPermission(id);
        await refresh();

        if (result === 'granted') {
          toast({
            title: 'Enabled',
            description: 'Permission granted.',
          });
          return;
        }

        if (result === 'denied') {
          toast({
            title: 'Permission denied',
            description: isInstalledApp()
              ? 'Enable this permission in your device Settings for ChravelApp.'
              : 'You can enable it in your browser or device settings.',
            variant: 'destructive',
            action: isInstalledApp() ? (
              <ToastAction
                altText="Open Settings"
                onClick={() =>
                  void (id === 'notifications'
                    ? handleOpenNotificationSettings()
                    : handleOpenSettings())
                }
              >
                Open Settings
              </ToastAction>
            ) : undefined,
          });
          return;
        }

        toast({
          title: 'Not enabled',
          description: isInstalledApp()
            ? 'If you changed your mind, try again or enable it in Settings for ChravelApp.'
            : 'If you changed your mind, try again or enable it in your browser settings.',
          action: isInstalledApp() ? (
            <ToastAction
              altText="Open Settings"
              onClick={() =>
                void (id === 'notifications'
                  ? handleOpenNotificationSettings()
                  : handleOpenSettings())
              }
            >
              Open Settings
            </ToastAction>
          ) : undefined,
        });
      } catch (error) {
        toast({
          title: 'Something went wrong',
          description: error instanceof Error ? error.message : 'Failed to request permission.',
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [refresh, toast, handleOpenSettings, handleOpenNotificationSettings],
  );

  const handleToggleChange = useCallback(
    async (id: PermissionId, checked: boolean) => {
      const status = statuses?.[id];
      if (!status) return;

      if (checked) {
        // Toggle ON: trigger just-in-time permission request
        await handleRequest(id);
        return;
      }

      // Toggle OFF: user wants to revoke — we can't do that from JS
      const canOpenSettings = status.canOpenSettings ?? false;
      toast({
        title: 'Revoke in Settings',
        description:
          'To turn off this permission, open your device Settings, choose ChravelApp, and toggle it off there.',
        action: canOpenSettings ? (
          <ToastAction altText="Open Settings" onClick={() => void handleOpenSettings()}>
            Open Settings
          </ToastAction>
        ) : undefined,
      });
    },
    [statuses, handleRequest, handleOpenSettings, toast],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400 mt-1">
            We only ask for permissions when you use a feature. You can review and update access
            here anytime.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Browsers only let apps request a permission the first time. After that, changes must be
            made in your browser or device settings.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="border-white/10 bg-white/5 hover:bg-white/10"
        >
          <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {cards.map(card => {
          const status = statuses?.[card.id];
          const state = status?.state ?? 'unknown';
          const detail = status?.detail;

          const isGranted = state === 'granted';
          const isDenied = state === 'denied';
          const isPrompt = state === 'prompt' || state === 'unknown';
          const isNotApplicable = state === 'not_applicable' || state === 'unavailable';
          /** No in-app control when the Notifications API is missing (e.g. some iOS WebViews) — omit the dead switch. */
          const hideNotificationsNonActionableToggle =
            card.id === 'notifications' && isNotApplicable;
          const isBusy = busyId === card.id;
          const helpOpen = expandedHelp === card.id;
          const instructions = getBrowserInstructions(browser, card.id);

          const openHelpOrSettings = async () => {
            if (installed) {
              if (card.id === 'notifications') {
                await handleOpenNotificationSettings();
              } else {
                await handleOpenSettings();
              }
              return;
            }
            setExpandedHelp(helpOpen ? null : card.id);
          };

          const copySiteOrigin = async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin);
              toast({ title: 'Copied', description: 'Site URL copied to clipboard.' });
            } catch {
              toast({
                title: 'Copy failed',
                description: window.location.origin,
                variant: 'destructive',
              });
            }
          };

          return (
            <div key={card.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5">{card.icon}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-white font-semibold">{card.title}</div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${badgeClasses(state)}`}
                      >
                        {formatState(state)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{card.description}</p>
                    {detail && <p className="text-xs text-gray-500 mt-2">{detail}</p>}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {isPrompt && (
                    <Switch
                      checked={false}
                      disabled={isBusy}
                      onCheckedChange={checked => void handleToggleChange(card.id, checked)}
                      aria-label={`Enable ${card.title}`}
                    />
                  )}
                  {isGranted && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openHelpOrSettings()}
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      Manage
                    </Button>
                  )}
                  {isDenied && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openHelpOrSettings()}
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      How to enable
                      {!installed &&
                        (helpOpen ? (
                          <ChevronUp className="ml-1 h-4 w-4" />
                        ) : (
                          <ChevronDown className="ml-1 h-4 w-4" />
                        ))}
                    </Button>
                  )}
                  {isNotApplicable && !hideNotificationsNonActionableToggle && (
                    <Switch checked={false} disabled aria-label="Unavailable" />
                  )}
                </div>
              </div>

              {isDenied && !installed && helpOpen && (
                <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                  <p className="text-xs text-gray-400">
                    Your browser is blocking this. To re-enable:
                  </p>
                  <ol className="text-sm text-gray-300 list-decimal list-inside space-y-1">
                    {instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copySiteOrigin()}
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy site URL
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void refresh()}
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                      I've updated — recheck
                    </Button>
                    {card.id === 'notifications' && (
                      <a
                        href="https://support.google.com/chrome/answer/3220216"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs text-primary hover:underline"
                      >
                        Browser help
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
