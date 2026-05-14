import React from 'react';
import {
  Bell,
  Radio,
  MessageCircle,
  Calendar,
  DollarSign,
  CheckSquare,
  BarChart2,
  UserPlus,
  MapPin,
} from 'lucide-react';
import type { NotificationPreferences } from '@/services/userPreferencesService';

/**
 * Single source of truth for consumer + enterprise “My Trips / Pro” notification rows.
 * Keep broadcast/pin copy and trip chat adjacent so deployed UI cannot silently diverge.
 */
export interface TripNotificationCategoryRow {
  key: string;
  dbKey: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function getTripNotificationPreferenceCategories(options: {
  includeTripInvites: boolean;
}): TripNotificationCategoryRow[] {
  const rows: TripNotificationCategoryRow[] = [
    {
      key: 'broadcasts',
      dbKey: 'broadcasts',
      label: 'Broadcast and pinned messages',
      description: 'Organizer broadcasts and when a message is pinned in chat',
      icon: <Radio size={16} className="text-red-400" />,
    },
    {
      key: 'chat',
      dbKey: 'chat_messages',
      label: 'Trip chat',
      description: 'Push for every new message in your trips (optional; off by default)',
      icon: <MessageCircle size={16} className="text-blue-400" />,
    },
    {
      key: 'calendar',
      dbKey: 'calendar_events',
      label: 'Calendar Events',
      description: 'Get notified when events are added or updated',
      icon: <Calendar size={16} className="text-purple-400" />,
    },
    {
      key: 'payments',
      dbKey: 'payments',
      label: 'Payments',
      description: 'Get notified about payment requests and settlements',
      icon: <DollarSign size={16} className="text-green-400" />,
    },
    {
      key: 'tasks',
      dbKey: 'tasks',
      label: 'Tasks',
      description: 'Get notified when tasks are assigned or completed',
      icon: <CheckSquare size={16} className="text-yellow-400" />,
    },
    {
      key: 'polls',
      dbKey: 'polls',
      label: 'Polls',
      description: 'Get notified when new polls are created',
      icon: <BarChart2 size={16} className="text-cyan-400" />,
    },
    {
      key: 'joinRequests',
      dbKey: 'join_requests',
      label: 'Join Requests',
      description: 'Get notified when someone requests to join your trip',
      icon: <UserPlus size={16} className="text-orange-400" />,
    },
    {
      key: 'basecampUpdates',
      dbKey: 'basecamp_updates',
      label: 'Basecamp Updates',
      description: 'Get notified when trip basecamp location changes',
      icon: <MapPin size={16} className="text-pink-400" />,
    },
  ];

  if (options.includeTripInvites) {
    rows.push({
      key: 'tripInvites',
      dbKey: 'trip_invites',
      label: 'Trip Invitations',
      description: 'When you are invited to join a trip',
      icon: <Bell size={16} className="text-gray-400" />,
    });
  }

  return rows;
}
