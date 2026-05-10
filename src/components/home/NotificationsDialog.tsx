import React, { useCallback, useMemo, useState } from 'react';
import {
  Bell,
  MessageCircle,
  Calendar,
  Radio,
  BarChart2,
  FilePlus,
  Image,
  X,
  Check,
  CheckSquare,
  DollarSign,
  UserPlus,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useNotificationRealtime } from '@/hooks/useNotificationRealtime';
import { mockNotifications } from '@/mockData/notifications';
import { approveJoinRequestById, rejectJoinRequestById } from '@/lib/joinRequestMutations';
import { cn } from '@/lib/utils';
import { useDemoTripMembersStore } from '@/store/demoTripMembersStore';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

interface Notification {
  id: string;
  type:
    | 'message'
    | 'broadcast'
    | 'calendar'
    | 'poll'
    | 'files'
    | 'photos'
    | 'chat'
    | 'mention'
    | 'task'
    | 'payment'
    | 'invite'
    | 'join_request'
    | 'join_approved'
    | 'join_rejected'
    | 'basecamp'
    | 'system';
  title: string;
  description: string;
  tripId: string;
  tripName: string;
  timestamp: string;
  isRead: boolean;
  isHighPriority?: boolean;
  data?: Record<string, unknown>;
}

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type NotificationMetadata = Record<string, unknown>;

interface NavigationTarget {
  path: string;
  state?: {
    chatNavigationContext?: {
      source: 'notification';
      notificationId: string;
      messageId?: string;
      channelId?: string;
      channelType?: string;
      openThreadId?: string;
    };
  };
}

function getMetadataString(metadata: NotificationMetadata, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function isJoinRequestApprovedNotification(notification: Notification): boolean {
  const action = String(notification.data?.action ?? '').toLowerCase();
  const type = String(notification.type ?? '').toLowerCase();
  const title = notification.title.toLowerCase();

  return (
    action === 'join_approved' ||
    type === 'join_approved' ||
    type === 'join_request_approved' ||
    title.includes('join request approved')
  );
}

function getJoinRequestIdFromMetadata(metadata: NotificationMetadata): string {
  const raw = metadata.request_id ?? metadata.join_request_id;
  return typeof raw === 'string' && raw.trim() !== '' ? raw : '';
}

/** In-app join request awaiting organizer action (has request id); excludes approved notices. */
function isPendingJoinRequestWithActions(notification: Notification): boolean {
  if (isJoinRequestApprovedNotification(notification)) {
    return false;
  }
  const t = String(notification.type ?? '').toLowerCase();
  if (t !== 'join_request') {
    return false;
  }
  return getJoinRequestIdFromMetadata((notification.data || {}) as NotificationMetadata) !== '';
}

function extractTripNameFromApprovalDescription(description: string): string | null {
  const match = description.match(/join\s+"([^"]+)"/i);
  return match?.[1]?.trim() || null;
}

function resolveNotificationTab(
  notification: Notification,
  metadata: NotificationMetadata,
): string | null {
  const notificationType = notification.type.toLowerCase();
  const metadataChannelType = getMetadataString(metadata, 'channel_type').toLowerCase();
  const metadataTab = getMetadataString(metadata, 'tab').toLowerCase();

  if (notificationType === 'mention') {
    return 'chat';
  }

  if (metadataTab) {
    return metadataTab;
  }

  if (metadataChannelType === 'chat' || metadataChannelType === 'messages') {
    return 'chat';
  }

  const tabMap: Record<string, string> = {
    message: 'chat',
    chat: 'chat',
    broadcast: 'broadcasts',
    calendar: 'calendar',
    task: 'tasks',
    payment: 'payments',
    poll: 'polls',
    photos: 'media',
    join_request: 'collaborators',
    basecamp: 'places',
  };

  return tabMap[notificationType] ?? null;
}

function buildNavigationTarget(
  notification: Notification,
  resolvedTripId: string,
  tripType: string,
  metadata: NotificationMetadata,
): NavigationTarget {
  const normalizedTripType = tripType.toLowerCase();
  let baseRoute = `/trip/${resolvedTripId}`;

  if (normalizedTripType === 'pro') {
    baseRoute = `/tour/pro/${resolvedTripId}`;
  } else if (normalizedTripType === 'event') {
    baseRoute = `/event/${resolvedTripId}`;
  }

  const tab = resolveNotificationTab(notification, metadata);
  const isJoinApproved = isJoinRequestApprovedNotification(notification);
  const path = !isJoinApproved && tab ? `${baseRoute}?tab=${tab}` : baseRoute;

  // stream_message_id is the canonical key set by stream-webhook
  const messageId =
    getMetadataString(metadata, 'stream_message_id') ||
    getMetadataString(metadata, 'message_id') ||
    getMetadataString(metadata, 'chat_message_id');
  const channelId =
    getMetadataString(metadata, 'stream_channel_id') ||
    getMetadataString(metadata, 'channel_id') ||
    getMetadataString(metadata, 'chat_channel_id');
  const channelType =
    getMetadataString(metadata, 'stream_channel_type') ||
    getMetadataString(metadata, 'channel_type');
  const openThreadId = getMetadataString(metadata, 'thread_id');

  const shouldHandshakeChat = tab === 'chat' || notification.type.toLowerCase() === 'mention';

  if (!shouldHandshakeChat) {
    return { path };
  }

  return {
    path,
    state: {
      chatNavigationContext: {
        source: 'notification',
        notificationId: notification.id,
        ...(messageId && { messageId }),
        ...(channelId && { channelId }),
        ...(channelType && { channelType }),
        ...(openThreadId && { openThreadId }),
      },
    },
  };
}

function getNotificationIcon(type: string, isHighPriority?: boolean) {
  const iconClass = isHighPriority ? 'text-destructive' : 'text-muted-foreground';

  switch (type) {
    case 'message':
    case 'chat':
      return <MessageCircle size={16} className="text-blue-400" />;
    case 'broadcast':
      return <Radio size={16} className="text-red-400" />;
    case 'calendar':
      return <Calendar size={16} className="text-purple-400" />;
    case 'poll':
      return <BarChart2 size={16} className="text-cyan-400" />;
    case 'task':
      return <CheckSquare size={16} className="text-yellow-400" />;
    case 'payment':
      return <DollarSign size={16} className="text-green-400" />;
    case 'files':
      return <FilePlus size={16} className={iconClass} />;
    case 'photos':
      return <Image size={16} className="text-pink-400" />;
    case 'join_request':
      return <UserPlus size={16} className="text-orange-400" />;
    case 'basecamp':
      return <MapPin size={16} className="text-pink-400" />;
    default:
      return <Bell size={16} className={iconClass} />;
  }
}

export const NotificationsDialog = ({ open, onOpenChange }: NotificationsDialogProps) => {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [joinActionLoadingId, setJoinActionLoadingId] = useState<string | null>(null);
  const [demoHiddenJoinNotificationIds, setDemoHiddenJoinNotificationIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, deleteNotification } =
    useNotificationRealtime();

  const resolveTripRouteContext = async (
    notification: Notification,
    metadata: NotificationMetadata,
  ): Promise<{ tripId: string; tripType: string }> => {
    const resolvedTripId = getMetadataString(metadata, 'trip_id') || notification.tripId || '';
    const resolvedTripType =
      getMetadataString(metadata, 'trip_type') || getMetadataString(metadata, 'tripType') || '';

    if (resolvedTripId && resolvedTripType) {
      return { tripId: resolvedTripId, tripType: resolvedTripType };
    }

    const tripNameCandidate =
      getMetadataString(metadata, 'trip_name') ||
      notification.tripName ||
      extractTripNameFromApprovalDescription(notification.description) ||
      '';

    if (resolvedTripId) {
      const { data: tripMatch } = await supabase
        .from('trips')
        .select('id, trip_type')
        .eq('id', resolvedTripId)
        .maybeSingle();

      if (tripMatch) {
        return {
          tripId: tripMatch.id,
          tripType: resolvedTripType || (tripMatch.trip_type as string) || '',
        };
      }

      return { tripId: resolvedTripId, tripType: resolvedTripType };
    }

    if (!tripNameCandidate) {
      return { tripId: '', tripType: resolvedTripType };
    }

    const { data: exactNameMatch } = await supabase
      .from('trips')
      .select('id, trip_type, created_at')
      .eq('name', tripNameCandidate)
      .order('created_at', { ascending: false })
      .limit(1);

    if (exactNameMatch && exactNameMatch.length > 0) {
      return {
        tripId: exactNameMatch[0].id,
        tripType: resolvedTripType || (exactNameMatch[0].trip_type as string) || '',
      };
    }

    const { data: fuzzyNameMatch } = await supabase
      .from('trips')
      .select('id, trip_type, created_at')
      .ilike('name', tripNameCandidate)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fuzzyNameMatch && fuzzyNameMatch.length > 0) {
      return {
        tripId: fuzzyNameMatch[0].id,
        tripType: resolvedTripType || (fuzzyNameMatch[0].trip_type as string) || '',
      };
    }

    return { tripId: '', tripType: resolvedTripType };
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!isDemoMode && user) {
      await markAsRead(notification.id);
    }

    const notificationData = (notification.data || {}) as NotificationMetadata;
    const { tripId: resolvedTripId, tripType } = await resolveTripRouteContext(
      notification,
      notificationData,
    );

    if (!resolvedTripId) {
      toast.error('Unable to open this trip. It may have been deleted.');
      onOpenChange(false);
      return;
    }

    const target = buildNavigationTarget(notification, resolvedTripId, tripType, notificationData);
    navigate(target.path, target.state ? { state: target.state } : undefined);

    onOpenChange(false);
  };

  const handleJoinRequestAccept = useCallback(
    async (notification: Notification, e: React.MouseEvent) => {
      e.stopPropagation();
      const metadata = (notification.data || {}) as NotificationMetadata;
      const requestId = getJoinRequestIdFromMetadata(metadata);
      if (!requestId || joinActionLoadingId) {
        return;
      }

      const tripId = getMetadataString(metadata, 'trip_id') || notification.tripId || '';

      setJoinActionLoadingId(notification.id);
      try {
        if (isDemoMode) {
          const requesterId = getMetadataString(metadata, 'requester_id');
          const requesterName =
            getMetadataString(metadata, 'requester_name') ||
            getMetadataString(metadata, 'actor_name') ||
            'New member';
          const avatar =
            typeof metadata.actor_avatar === 'string' ? metadata.actor_avatar : undefined;
          if (requesterId && tripId) {
            useDemoTripMembersStore.getState().addMember(tripId, {
              id: requesterId,
              name: requesterName,
              avatar,
            });
          }
          toast.success('✅ Request approved - member added to trip!');
          setDemoHiddenJoinNotificationIds(prev => new Set(prev).add(notification.id));
          return;
        }

        if (!user) {
          return;
        }

        await approveJoinRequestById(queryClient, { requestId, tripId: tripId || undefined });
        await deleteNotification(notification.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to approve request');
      } finally {
        setJoinActionLoadingId(null);
      }
    },
    [joinActionLoadingId, isDemoMode, user, queryClient, deleteNotification],
  );

  const handleJoinRequestReject = useCallback(
    async (notification: Notification, e: React.MouseEvent) => {
      e.stopPropagation();
      const metadata = (notification.data || {}) as NotificationMetadata;
      const requestId = getJoinRequestIdFromMetadata(metadata);
      if (!requestId || joinActionLoadingId) {
        return;
      }

      const tripId = getMetadataString(metadata, 'trip_id') || notification.tripId || '';

      setJoinActionLoadingId(notification.id);
      try {
        if (isDemoMode) {
          toast.success('Request rejected');
          setDemoHiddenJoinNotificationIds(prev => new Set(prev).add(notification.id));
          return;
        }

        if (!user) {
          return;
        }

        await rejectJoinRequestById(queryClient, { requestId, tripId: tripId || undefined });
        await deleteNotification(notification.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to reject request');
      } finally {
        setJoinActionLoadingId(null);
      }
    },
    [joinActionLoadingId, isDemoMode, user, queryClient, deleteNotification],
  );

  const handleMarkAllAsRead = async () => {
    if (!isDemoMode && user) {
      await markAllAsRead(notifications);
    }
  };

  const handleClearAll = async () => {
    if (!isDemoMode && user) {
      await clearAll(notifications);
    }
  };

  // Demo mode: use mock data (hook returns empty when isDemoMode)
  const displayNotifications = useMemo(() => {
    const mapped = isDemoMode
      ? mockNotifications.map(n => ({
          id: n.id,
          type: n.type as Notification['type'],
          title: n.title,
          description: n.message,
          tripId: n.tripId,
          tripName: n.data?.trip_name || 'Demo Trip',
          timestamp: formatDistanceToNow(new Date(n.timestamp), { addSuffix: true }),
          isRead: n.read,
          isHighPriority: n.type === 'broadcast',
          data: { ...n.data, tripType: n.tripType },
        }))
      : notifications;

    if (!isDemoMode) {
      return mapped;
    }
    return mapped.filter(n => !demoHiddenJoinNotificationIds.has(n.id));
  }, [isDemoMode, notifications, demoHiddenJoinNotificationIds]);

  const displayUnreadCount = isDemoMode
    ? displayNotifications.filter(n => !n.isRead).length
    : unreadCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="sm:max-w-[500px] max-h-[80vh] bg-card/95 backdrop-blur-xl border-2 border-border/50 text-foreground p-0"
      >
        <DialogHeader className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Notifications</DialogTitle>
            <DialogClose asChild>
              <button
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                aria-label="Close notifications"
              >
                <X size={18} />
              </button>
            </DialogClose>
          </div>

          {displayNotifications.length > 0 && (
            <div className="flex items-center gap-4 mt-3 pt-2">
              {displayUnreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors font-medium px-3 py-1.5 rounded-lg"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors font-medium px-3 py-1.5 rounded-lg"
              >
                Clear all
              </button>
            </div>
          )}
        </DialogHeader>

        <div className="max-h-[calc(80vh-8rem)] overflow-y-auto">
          {displayNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell size={32} className="mx-auto mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            displayNotifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  'p-4 border-b border-border/50 hover:bg-accent/10 cursor-pointer transition-colors',
                  !notification.isRead && 'bg-accent/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {getNotificationIcon(notification.type, notification.isHighPriority)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          !notification.isRead ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {notification.title}
                      </p>
                      {notification.isHighPriority && (
                        <div className="w-2 h-2 bg-destructive rounded-full"></div>
                      )}
                      {!notification.isRead && (
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1 truncate">
                      {notification.description}
                    </p>
                    {isJoinRequestApprovedNotification(notification) && (
                      <p className="text-[11px] text-primary/85 mb-1">Tap to open trip</p>
                    )}
                    {isPendingJoinRequestWithActions(notification) && (
                      <div
                        className="flex flex-wrap items-center gap-2 mt-2"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                        role="group"
                        aria-label="Join request actions"
                      >
                        <button
                          type="button"
                          disabled={joinActionLoadingId !== null}
                          onClick={e => {
                            void handleJoinRequestAccept(notification, e);
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-medium px-2.5 py-1.5 min-h-[44px] sm:min-h-0 disabled:opacity-50"
                          aria-label="Accept join request"
                        >
                          <Check size={14} className="shrink-0" aria-hidden />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={joinActionLoadingId !== null}
                          onClick={e => {
                            void handleJoinRequestReject(notification, e);
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-destructive/90 hover:bg-destructive text-destructive-foreground text-xs font-medium px-2.5 py-1.5 min-h-[44px] sm:min-h-0 disabled:opacity-50"
                          aria-label="Deny join request"
                        >
                          <X size={14} className="shrink-0" aria-hidden />
                          Deny
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground/70">{notification.tripName}</p>
                      <p className="text-xs text-muted-foreground/70">{notification.timestamp}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="mt-1 text-muted-foreground/60" />
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
