import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * Self-verification helper for push notifications + home-screen badge.
 *
 * Exercises the exact client-side surfaces the real push path uses — the
 * service worker's `showNotification` and the Badging API `setAppBadge` — so a
 * user can confirm, on their *installed* PWA, that notifications render and the
 * app-icon badge appears, without needing a second account or a server round-trip.
 *
 * This does NOT test server → push delivery while the app is fully closed; for
 * that, have another member trigger a real notification (see
 * docs/PUSH_NOTIFICATIONS_AND_BADGES.md, runbook §A).
 */
export const TestNotificationButton: React.FC<ButtonProps> = props => {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  const handleTest = async () => {
    setIsSending(true);
    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        toast({
          title: 'Not supported here',
          description: 'Open the installed app (Add to Home Screen) to test notifications.',
          variant: 'destructive',
        });
        return;
      }

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        toast({
          title: 'Notifications blocked',
          description: 'Allow notifications for this app, then try again.',
          variant: 'destructive',
        });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('ChravelApp', {
        body: 'Test notification — push is working. 🎉',
        icon: '/chravel-logo.png',
        badge: '/chravel-badge.png',
        tag: 'chravel-test-notification',
        data: { type: 'test' },
      });

      // Show the OS app-icon badge (PWA / installed app). No-op where unsupported.
      const nav = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void> };
      if (typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(1).catch(() => {});
      }

      toast({
        title: 'Test sent',
        description:
          'Check your notification, then background the app — a badge should appear on the icon.',
      });
    } catch {
      toast({
        title: 'Could not send test',
        description: 'Something went wrong showing the test notification.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleTest} disabled={isSending} {...props}>
      <Bell className="mr-2 h-4 w-4" />
      {isSending ? 'Sending…' : 'Send a test notification'}
    </Button>
  );
};

export default TestNotificationButton;
