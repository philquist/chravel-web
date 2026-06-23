import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

import { toast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { Switch } from '@/components/ui/switch';
import { SmartImportSettings } from '@/features/smart-import/components/SmartImportSettings';
import { BlockedUsersList } from './BlockedUsersList';
import { DeleteAccountDialog } from './DeleteAccountDialog';

const APP_PREFS_KEY = 'chravel_app_preferences';

interface AppPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
}

function loadAppPreferences(): AppPreferences {
  try {
    const stored = localStorage.getItem(APP_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse error
  }
  return { language: 'English', timezone: 'Pacific Time (PT)', dateFormat: 'MM/DD/YYYY' };
}

function saveAppPreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(APP_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore write error
  }
}

export const ConsumerGeneralSettings = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [appPrefs, setAppPrefs] = useState<AppPreferences>(loadAppPreferences);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);

  return (
    <div className="space-y-3">
      {/* Appearance */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Appearance</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDarkMode ? (
                <Moon size={18} className="text-gray-400" />
              ) : (
                <Sun size={18} className="text-gold-primary" />
              )}
              <div>
                <div className="text-white font-medium">Light Mode</div>
                <div className="text-sm text-gray-400">
                  {isDarkMode ? 'Dark theme active' : 'Light theme active'}
                </div>
              </div>
            </div>
            <Switch checked={!isDarkMode} onCheckedChange={checked => toggleTheme(!checked)} />
          </div>
        </div>
      </div>

      {/* App Preferences */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">App Preferences</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Language</label>
            <select
              value={appPrefs.language}
              aria-label="Language preference"
              onChange={e => {
                const updated = { ...appPrefs, language: e.target.value };
                setAppPrefs(updated);
                saveAppPreferences(updated);
                toast({
                  title: 'Language updated',
                  description: `Language set to ${e.target.value}.`,
                });
              }}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Time Zone</label>
            <select
              value={appPrefs.timezone}
              aria-label="Time zone preference"
              onChange={e => {
                const updated = { ...appPrefs, timezone: e.target.value };
                setAppPrefs(updated);
                saveAppPreferences(updated);
                toast({
                  title: 'Time zone updated',
                  description: `Time zone set to ${e.target.value}.`,
                });
              }}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option>Pacific Time (PT)</option>
              <option>Mountain Time (MT)</option>
              <option>Central Time (CT)</option>
              <option>Eastern Time (ET)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Date Format</label>
            <select
              value={appPrefs.dateFormat}
              aria-label="Date format preference"
              onChange={e => {
                const updated = { ...appPrefs, dateFormat: e.target.value };
                setAppPrefs(updated);
                saveAppPreferences(updated);
                toast({
                  title: 'Date format updated',
                  description: `Date format set to ${e.target.value}.`,
                });
              }}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option>MM/DD/YYYY</option>
              <option>DD/MM/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Integrations</h4>
        <SmartImportSettings />
      </div>

      {/* Data & Storage */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Data & Storage</h4>
        <div className="space-y-3">
          <button
            onClick={() => {
              try {
                // Clear TanStack Query cache if available
                if (window.caches) {
                  window.caches
                    .keys()
                    .then(names => names.forEach(name => window.caches.delete(name)));
                }
                setCacheClearSuccess(true);
                toast({
                  title: 'Cache Cleared',
                  description: 'App cache has been cleared successfully.',
                });
                setTimeout(() => setCacheClearSuccess(false), 3000);
              } catch {
                toast({
                  title: 'Error',
                  description: 'Failed to clear cache.',
                  variant: 'destructive',
                });
              }
            }}
            className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <div className="text-left">
              <div className="text-white font-medium">Clear Cache</div>
              <div className="text-sm text-gray-400">Clear stored app data to free up space</div>
            </div>
            <div className={cacheClearSuccess ? 'text-green-400' : 'text-primary'}>
              {cacheClearSuccess ? 'Done!' : 'Clear'}
            </div>
          </button>
        </div>
      </div>

      {/* Account Management */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Account Management</h4>
        <div className="space-y-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="w-full flex items-center justify-between p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
          >
            <div className="text-left">
              <div className="text-red-400 font-medium">Delete Account</div>
              <div className="text-sm text-gray-400">
                Permanently delete your account and all data immediately
              </div>
            </div>
            <div className="text-red-400">Delete</div>
          </button>
        </div>
      </div>

      {/* Safety & Abuse */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-base font-semibold text-white mb-3">Safety & Abuse</h4>
        <div className="space-y-3">
          <a
            href="mailto:safety@chravelapp.com?subject=Report%20Abuse%20on%20Chravel"
            className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <div className="text-left">
              <div className="text-white font-medium">Report Abuse or Harassment</div>
              <div className="text-sm text-gray-400">
                Contact our safety team for urgent moderation help
              </div>
            </div>
            <div className="text-primary">Report</div>
          </a>
          <div className="pt-1">
            <div className="text-white font-medium mb-2">Blocked Users</div>
            <BlockedUsersList />
          </div>
        </div>
      </div>

      {/* Account Deletion Confirmation Dialog */}
      <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
    </div>
  );
};
