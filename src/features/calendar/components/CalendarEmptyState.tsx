import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { ActionPill } from '@/components/ui/ActionPill';

interface CalendarEmptyStateProps {
  onAddEvent?: () => void;
}

export const CalendarEmptyState = ({ onAddEvent }: CalendarEmptyStateProps) => {
  return (
    <div className="flex justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-lg rounded-2xl border border-glass-slate-border bg-glass-slate-card p-6 sm:p-8 text-center shadow-enterprise-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 ring-1 ring-border/60">
          <CalendarIcon className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">
          No events scheduled yet
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Start your itinerary by adding your first event. Imported events will show up here too.
        </p>
        {onAddEvent && (
          <div className="mt-5 flex justify-center">
            <ActionPill variant="manualOutline" onClick={onAddEvent} className="min-h-11 px-5">
              Add first event
            </ActionPill>
          </div>
        )}
      </div>
    </div>
  );
};
