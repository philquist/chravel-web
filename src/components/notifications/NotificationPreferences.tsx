/**
 * Notification Preferences Component
 *
 * Allows users to configure:
 * - Which channels to receive notifications (push, email, SMS)
 * - Which types of notifications to receive
 * - Quiet hours
 */

import React from 'react';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import {
  Bell,
  Moon,
  Mail,
  MessageSquare,
  DollarSign,
  Calendar,
  Users,
  Megaphone,
} from 'lucide-react';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';

export const NotificationPreferences = () => {
  const { preferences: prefs, isLoading: loading, updatePreference } = useNotificationPreferences();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 gold-gradient-spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Notification Preferences</h3>
          <p className="text-sm text-muted-foreground">
            Manage how and when you receive notifications
          </p>
        </div>
        <Bell className="h-8 w-8 text-primary" />
      </div>

      {/* Channels */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-semibold text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Notification Channels
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="push">Push Notifications</Label>
            </div>
            <Switch
              id="push"
              checked={prefs.push_enabled}
              onCheckedChange={v => void updatePreference('push_enabled', v)}
              aria-label="Toggle push notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="email">Email Notifications</Label>
            </div>
            <Switch
              id="email"
              checked={prefs.email_enabled}
              onCheckedChange={v => void updatePreference('email_enabled', v)}
              aria-label="Toggle email notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="sms">SMS Notifications</Label>
            </div>
            <Switch
              id="sms"
              checked={prefs.sms_enabled}
              onCheckedChange={v => void updatePreference('sms_enabled', v)}
              aria-label="Toggle SMS notifications"
            />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-semibold text-lg">What to notify me about</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="broadcasts">Broadcast and pinned messages</Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Organizer broadcasts and pin alerts (not every chat message)
              </p>
            </div>
            <Switch
              id="broadcasts"
              checked={prefs.broadcasts_and_pins}
              onCheckedChange={v => void updatePreference('broadcasts_and_pins', v)}
              aria-label="Toggle broadcast and pinned message notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="messages">Trip chat</Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Push for every new message when enabled (off by default)
              </p>
            </div>
            <Switch
              id="messages"
              checked={prefs.messages}
              onCheckedChange={v => void updatePreference('messages', v)}
              aria-label="Toggle trip chat message notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="tasks">Task assignments</Label>
            </div>
            <Switch
              id="tasks"
              checked={prefs.tasks}
              onCheckedChange={v => void updatePreference('tasks', v)}
              aria-label="Toggle task assignment notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="payments">Payment requests</Label>
            </div>
            <Switch
              id="payments"
              checked={prefs.payments}
              onCheckedChange={v => void updatePreference('payments', v)}
              aria-label="Toggle payment request notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="calendar">Calendar event reminders</Label>
            </div>
            <Switch
              id="calendar"
              checked={prefs.calendar_events}
              onCheckedChange={v => void updatePreference('calendar_events', v)}
              aria-label="Toggle calendar event reminder notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="polls">Polls</Label>
            </div>
            <Switch
              id="polls"
              checked={prefs.polls}
              onCheckedChange={v => void updatePreference('polls', v)}
              aria-label="Toggle poll notifications"
            />
          </div>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-semibold text-lg flex items-center gap-2">
          <Moon className="h-5 w-5" />
          Quiet Hours
        </h4>
        <div className="flex items-center justify-between mb-4">
          <div>
            <Label htmlFor="quiet">Enable quiet hours</Label>
            <p className="text-xs text-muted-foreground">
              Pause non-urgent notifications during these hours
            </p>
          </div>
          <Switch id="quiet" checked={false} disabled aria-label="Toggle quiet hours" />
        </div>
        <p className="text-xs text-muted-foreground">
          Quiet hours are managed in advanced settings.
        </p>
      </div>
    </div>
  );
};
