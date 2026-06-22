import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

// Own the vertical scroll (like the Tasks/Polls tabs) so long event-tab content is
// reachable inside MobileTripTabs' flex-column wrapper. `flex-1 min-h-0` is inert on
// the desktop/block render paths (EventDetailContent), so the outer container keeps
// the single scrollbar there; `mobile-safe-scroll` clears the bottom nav / safe area.
export const EVENT_TAB_PANEL_CLASS =
  'relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-5 space-y-5 mobile-safe-scroll';

interface EventTabHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export const EventTabHeader = ({ icon, title, subtitle, actions }: EventTabHeaderProps) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div className="flex items-start gap-3 min-w-0">
      {icon}
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-white leading-tight">{title}</h2>
        <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
      </div>
    </div>
    {actions ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 w-full md:w-auto md:min-w-[360px]">
        {actions}
      </div>
    ) : null}
  </div>
);

export const EventTabLoadingState = ({ label }: { label: string }) => (
  <div
    className="flex items-center justify-center py-14"
    role="status"
    aria-label={`Loading ${label}`}
  >
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="animate-spin rounded-full h-8 w-8 gold-gradient-spinner" />
      <p className="text-sm text-gray-400">Loading {label}...</p>
    </div>
  </div>
);

export const EventTabErrorState = ({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  className?: string;
}) => (
  <div
    className={cn('flex flex-col items-center justify-center py-14 gap-4 text-center', className)}
  >
    <AlertCircle size={44} className="text-red-400" />
    <h3 className="text-lg font-medium text-white">{title}</h3>
    <p className="text-sm text-gray-400 max-w-md">{description}</p>
    <Button
      onClick={onRetry}
      variant="outline"
      className="flex items-center gap-2"
      aria-label="Retry"
    >
      <RefreshCw size={16} />
      Retry
    </Button>
  </div>
);
