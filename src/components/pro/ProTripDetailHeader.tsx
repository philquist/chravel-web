import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Inbox, Settings, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '../../hooks/useAuth';
import type { ProTripData } from '../../types/pro';

interface ProTripDetailHeaderProps {
  tripContext: ProTripData | null;
  showInbox: boolean;
  onToggleInbox: () => void;
  onShowInvite: () => void;
  onShowTripSettings: () => void;
  onShowAuth: () => void;
}

export const ProTripDetailHeader = ({
  tripContext: _tripContext,
  showInbox,
  onToggleInbox,
  onShowInvite,
  onShowTripSettings,
  onShowAuth,
}: ProTripDetailHeaderProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="flex items-center justify-between mb-4">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-3 text-gray-300 hover:text-white transition-colors group min-h-[44px]"
        aria-label="Back to trips dashboard"
      >
        <div className="bg-gray-800 p-2 rounded-lg shadow-lg group-hover:shadow-ring-glow transition-all border border-gray-700 hover:border-gold-primary/50">
          <ArrowLeft size={20} />
        </div>
        <span className="font-medium">Back to Trips</span>
      </button>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Message inbox"
          aria-pressed={showInbox}
          onClick={onToggleInbox}
          className={cn(
            'h-10 w-10 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:border-gold-primary/50 hover:bg-white/5',
            showInbox && 'bg-gold-primary/15 text-gold-primary border-gold-primary/40',
          )}
        >
          <Inbox size={18} />
        </Button>

        <Button
          onClick={user ? onShowInvite : onShowAuth}
          className="h-10 rounded-xl bg-gradient-to-r from-gold-primary to-gold-mid text-primary-foreground font-medium hover:opacity-90 px-4"
        >
          <UserPlus size={16} className="mr-2" />
          Invite
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Trip settings"
          onClick={onShowTripSettings}
          className="h-10 w-10 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:border-gold-primary/50 hover:bg-white/5"
        >
          <Settings size={18} />
        </Button>

        {/* Pro Badge */}
        <div className="bg-gradient-to-r from-gold-primary to-gold-mid backdrop-blur-sm border border-gold-primary/30 rounded-xl px-4 py-2 flex items-center gap-2">
          <span className="text-primary-foreground font-medium">PRO</span>
        </div>
      </div>
    </div>
  );
};
