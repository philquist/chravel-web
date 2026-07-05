import React from 'react';
import { Lock } from 'lucide-react';

interface InviteSettingsSectionProps {
  expireIn7Days: boolean;
  onExpireIn7DaysChange: (checked: boolean) => void;
}

export const InviteSettingsSection = ({
  expireIn7Days,
  onExpireIn7DaysChange,
}: InviteSettingsSectionProps) => {
  return (
    <div className="mb-3 space-y-2" role="group" aria-label="Invite link settings">
      {/* Approval is enforced server-side for all trip types (join-trip edge
          function); shown as a static policy note rather than a dead toggle. */}
      <div className="flex items-center gap-2 min-h-[44px]">
        <Lock size={14} className="text-amber-400" aria-hidden="true" />
        <span className="text-gray-300 text-sm">Admin approval required</span>
      </div>
      <p className="text-xs text-gray-500 pl-0">
        Someone in the trip must approve new members before they can join
      </p>
      <div className="flex items-center justify-between min-h-[44px]">
        <label htmlFor="expire-toggle" className="text-gray-300 text-sm">
          Link expires in 7 days
        </label>
        <input
          id="expire-toggle"
          type="checkbox"
          checked={expireIn7Days}
          onChange={e => onExpireIn7DaysChange(e.target.checked)}
          aria-label="Set invite link to expire in 7 days"
          className="rounded min-w-[20px] min-h-[20px] w-5 h-5"
        />
      </div>
    </div>
  );
};
