import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import {
  User,
  Bell,
  Lock,
  Globe,
  HelpCircle,
  FileText,
  LogOut,
  Crown,
  Smartphone,
  Moon,
  Sun,
  Shield,
  Mail,
  MessageCircle,
  Radio,
  Star,
  Info,
  Calendar,
  Trash2,
  Ticket,
} from 'lucide-react';
import { hapticService } from '@/services/hapticService';
import { NativeList, NativeListSection, NativeListItem, NativeToggleItem } from './NativeList';
import { NativeLargeTitle } from './NativeLargeTitle';
import {
  getPlatform,
  purchaseTripPass,
  restoreAndSyncEntitlements,
  handlePurchaseResult,
} from '@/integrations/revenuecat/revenuecatClient';
import { useAuth } from '@/hooks/useAuth';
import { RefreshCw } from 'lucide-react';

import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { usePushPreferenceToggle } from '@/hooks/usePushPreferenceToggle';
import { TRIP_PASS_DISPLAY } from '@/billing/pricingDisplay';
import { toast } from 'sonner';

interface NativeSettingsProps {
  user?: {
    id: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  };
  subscriptionTier?: string;
  onBack?: () => void;
  onLogout?: () => void;
  onNavigate?: (section: string) => void;
  className?: string;
}

/**
 * iOS Settings app style settings screen.
 */
export const NativeSettings = ({
  user,
  subscriptionTier = 'free',
  onBack,
  onLogout,
  onNavigate,
  className,
}: NativeSettingsProps) => {
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [buildNumber, setBuildNumber] = useState<string>('1');

  const { preferences, updatePreference } = useNotificationPreferences();
  const { applyPushEnabled } = usePushPreferenceToggle();
  const navigate = useNavigate();

  const handleDeleteAccount = useCallback(async () => {
    await hapticService.warning();
    // Route to the actionable in-app deletion surface — the General Settings
    // section (ConsumerGeneralSettings → Account Management → Delete Account,
    // which calls the delete-account edge function with password re-auth for email users only).
    // to the real `?openSettings=settings` deep link rather than delegating an
    // opaque nav key, so the destination is guaranteed and never resolves to
    // the public `/delete-account` *informational* page (Guideline 5.1.1).
    navigate('/?openSettings=settings');
  }, [navigate]);

  // Appearance settings
  const { isDarkMode, toggleTheme } = useTheme();
  const [hapticFeedback, setHapticFeedback] = useState(true);

  // Privacy settings
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  // Load app info (web-only — native handled by chravel-mobile)
  React.useEffect(() => {
    setAppVersion((import.meta.env.VITE_APP_VERSION as string) || '1.0.0');
    const buildId = (import.meta.env.VITE_BUILD_ID as string) || 'dev';
    setBuildNumber(buildId.slice(0, 7));
  }, []);

  const platform = getPlatform();

  const handleUpgrade = useCallback(async () => {
    await hapticService.light();
    onNavigate?.('subscription');
  }, [onNavigate]);

  const handleLogout = useCallback(async () => {
    await hapticService.warning();
    onLogout?.();
  }, [onLogout]);

  const handleNavigate = useCallback(
    async (section: string) => {
      await hapticService.light();
      onNavigate?.(section);
    },
    [onNavigate],
  );

  const [tripPassLoading, setTripPassLoading] = useState<'explorer' | 'frequent-chraveler' | null>(
    null,
  );

  const { user: authUser } = useAuth();
  const [restoreLoading, setRestoreLoading] = useState(false);

  const handlePurchaseTripPass = useCallback(async (tier: 'explorer' | 'frequent-chraveler') => {
    await hapticService.light();
    setTripPassLoading(tier);
    try {
      const result = await purchaseTripPass(tier);
      if (result.success) await hapticService.success();
      handlePurchaseResult(result, {
        successMessage: 'Trip Pass activated!',
        successDescription: 'Premium features are unlocking now.',
        onRetry: () => void handlePurchaseTripPass(tier),
        context: `trip-pass:${tier}`,
      });
    } finally {
      setTripPassLoading(null);
    }
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    if (!authUser?.id) {
      toast.error('Please sign in before restoring purchases.');
      return;
    }
    await hapticService.light();
    setRestoreLoading(true);
    try {
      const result = await restoreAndSyncEntitlements(authUser.id);
      if (result.success && result.data) {
        await hapticService.success();
        const tier = result.data.plan.tier;
        toast.success('Purchases restored', {
          description:
            tier === 'free'
              ? 'No active purchases were found on this Apple ID.'
              : `Your ${tier.replace('-', ' ')} entitlement is now active.`,
        });
      } else {
        handlePurchaseResult(
          { ...result, success: false },
          { onRetry: handleRestorePurchases, context: 'restore' },
        );
      }
    } finally {
      setRestoreLoading(false);
    }
  }, [authUser?.id]);

  const isPro = subscriptionTier !== 'free';
  const showTripPasses = !isPro && platform !== 'web';

  return (
    <>
      <NativeLargeTitle title="Settings" onBack={onBack} className={className}>
        <NativeList>
          {/* Profile Section */}
          <NativeListSection>
            <NativeListItem
              icon={
                user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-full h-full rounded-md object-cover"
                  />
                ) : (
                  <User size={18} />
                )
              }
              label={user?.name || 'Guest User'}
              sublabel={user?.email || 'Sign in to sync your trips'}
              showChevron
              onPress={() => handleNavigate('profile')}
            />
          </NativeListSection>

          {/* Subscription Section */}
          <NativeListSection
            header="Subscription"
            footer={
              showTripPasses
                ? 'Trip Pass gives you full premium for one trip — no recurring charge. Restore Purchases re-applies passes you already bought.'
                : undefined
            }
          >
            <NativeListItem
              icon={<Crown size={18} />}
              label={isPro ? 'ChravelApp Pro' : 'Free Plan'}
              value={isPro ? <span className="text-green-400">Active</span> : undefined}
              sublabel={
                isPro ? `${subscriptionTier.replace('-', ' ')} tier` : 'Upgrade for unlimited trips'
              }
              showChevron
              onPress={isPro ? () => handleNavigate('subscription') : handleUpgrade}
            />
            {showTripPasses && (
              <>
                <NativeListItem
                  icon={<Ticket size={18} />}
                  label="Explorer Trip Pass"
                  sublabel={`${TRIP_PASS_DISPLAY.explorer.price} · ${TRIP_PASS_DISPLAY.explorer.durationDays} days`}
                  value={
                    tripPassLoading === 'explorer' ? (
                      <span className="text-gray-400">…</span>
                    ) : undefined
                  }
                  onPress={
                    tripPassLoading ? undefined : () => void handlePurchaseTripPass('explorer')
                  }
                />
                <NativeListItem
                  icon={<Ticket size={18} />}
                  label="Frequent Chraveler Trip Pass"
                  sublabel={`${TRIP_PASS_DISPLAY['frequent-chraveler'].price} · ${TRIP_PASS_DISPLAY['frequent-chraveler'].durationDays} days`}
                  value={
                    tripPassLoading === 'frequent-chraveler' ? (
                      <span className="text-gray-400">…</span>
                    ) : undefined
                  }
                  onPress={
                    tripPassLoading
                      ? undefined
                      : () => void handlePurchaseTripPass('frequent-chraveler')
                  }
                />
              </>
            )}
            {platform !== 'web' && (
              <NativeListItem
                icon={
                  <RefreshCw size={18} className={restoreLoading ? 'animate-spin' : undefined} />
                }
                label="Restore Purchases"
                sublabel="Re-apply subscriptions or Trip Passes from this Apple ID"
                value={restoreLoading ? <span className="text-gray-400">…</span> : undefined}
                onPress={restoreLoading ? undefined : () => void handleRestorePurchases()}
              />
            )}
          </NativeListSection>

          {/* Notifications Section */}
          <NativeListSection
            header="Notifications"
            footer="Turn off trip chat if you only want organizer broadcasts and pins. Push delivery uses your device token from chravel-mobile on iOS/Android."
          >
            <NativeToggleItem
              icon={<Bell size={18} />}
              label="Push Notifications"
              checked={preferences.push_enabled}
              onChange={checked => {
                void (async () => {
                  const result = await applyPushEnabled(checked);
                  if (result === 'ok' || result === 'unsupported') {
                    await updatePreference('push_enabled', checked);
                    return;
                  }
                  if (result === 'permission_denied') {
                    toast.error('Allow notifications in iOS Settings to enable push.');
                  }
                })();
              }}
            />
            <NativeToggleItem
              icon={<Mail size={18} />}
              label="Email Notifications"
              checked={preferences.email_enabled}
              onChange={checked => void updatePreference('email_enabled', checked)}
            />
            <NativeToggleItem
              icon={<Radio size={18} />}
              label="Broadcast and pinned messages"
              sublabel="Trip-wide announcements and pin alerts"
              checked={preferences.broadcasts_and_pins}
              onChange={checked => void updatePreference('broadcasts_and_pins', checked)}
            />
            <NativeToggleItem
              icon={<MessageCircle size={18} />}
              label="Trip chat"
              sublabel="Every new chat message across your trips (like iMessage)"
              checked={preferences.messages}
              onChange={checked => void updatePreference('messages', checked)}
            />
            <NativeToggleItem
              icon={<Calendar size={18} />}
              label="Calendar Reminders"
              sublabel="Upcoming events and deadlines"
              checked={preferences.calendar_events}
              onChange={checked => void updatePreference('calendar_events', checked)}
            />
          </NativeListSection>

          {/* Appearance Section */}
          <NativeListSection header="Appearance">
            <NativeToggleItem
              icon={isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
              label="Dark Mode"
              checked={isDarkMode}
              onChange={toggleTheme}
            />
            <NativeToggleItem
              icon={<Smartphone size={18} />}
              label="Haptic Feedback"
              sublabel="Vibration on interactions"
              checked={hapticFeedback}
              onChange={setHapticFeedback}
            />
          </NativeListSection>

          {/* Privacy Section */}
          <NativeListSection
            header="Privacy"
            footer="Your data is encrypted and never sold to third parties."
          >
            <NativeToggleItem
              icon={<Shield size={18} />}
              label="Analytics"
              sublabel="Help improve ChravelApp"
              checked={analyticsEnabled}
              onChange={setAnalyticsEnabled}
            />
            <NativeToggleItem
              icon={<Globe size={18} />}
              label="Location Services"
              sublabel="For nearby places and maps"
              checked={locationEnabled}
              onChange={setLocationEnabled}
            />
            <NativeListItem
              icon={<Lock size={18} />}
              label="Privacy Policy"
              showChevron
              onPress={() => handleNavigate('privacy')}
            />
          </NativeListSection>

          {/* Support Section */}
          <NativeListSection header="Support">
            <NativeListItem
              icon={<HelpCircle size={18} />}
              label="Help Center"
              showChevron
              onPress={() => handleNavigate('help')}
            />
            <NativeListItem
              icon={<MessageCircle size={18} />}
              label="Contact Support"
              showChevron
              onPress={() => handleNavigate('contact')}
            />
            <NativeListItem
              icon={<Star size={18} />}
              label="Rate ChravelApp"
              sublabel={platform === 'ios' ? 'App Store' : 'Play Store'}
              showChevron
              onPress={() => handleNavigate('rate')}
            />
          </NativeListSection>

          {/* Legal Section */}
          <NativeListSection header="Legal">
            <NativeListItem
              icon={<FileText size={18} />}
              label="Terms of Service"
              showChevron
              onPress={() => handleNavigate('terms')}
            />
            <NativeListItem
              icon={<Shield size={18} />}
              label="Privacy Policy"
              showChevron
              onPress={() => handleNavigate('privacy')}
            />
            <NativeListItem
              icon={<FileText size={18} />}
              label="Licenses"
              showChevron
              onPress={() => handleNavigate('licenses')}
            />
          </NativeListSection>

          {/* App Info Section */}
          <NativeListSection header="About">
            <NativeListItem
              icon={<Info size={18} />}
              label="Version"
              value={`${appVersion} (${buildNumber})`}
            />
            <NativeListItem
              icon={<Smartphone size={18} />}
              label="Platform"
              value={platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web'}
            />
          </NativeListSection>

          {/* Account — opens the actionable in-app deletion flow
              (delete-account edge function + optional password re-auth for email users)
              that lives in ConsumerGeneralSettings. Required for App Store
              Guideline 5.1.1 (in-app account deletion). */}
          {user && (
            <NativeListSection
              header="Account"
              footer="Deleting your account permanently removes your data immediately. This cannot be undone."
            >
              <NativeListItem
                icon={<Trash2 size={18} />}
                label="Delete Account"
                destructive
                showChevron
                onPress={handleDeleteAccount}
              />
            </NativeListSection>
          )}

          {/* Logout */}
          {user && (
            <NativeListSection>
              <NativeListItem
                icon={<LogOut size={18} />}
                label="Sign Out"
                destructive
                onPress={handleLogout}
              />
            </NativeListSection>
          )}

          {/* Bottom spacing for safe area */}
          <div className="h-8" />
        </NativeList>
      </NativeLargeTitle>
    </>
  );
};
