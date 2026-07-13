import React from 'react';
import { BarChart3 } from 'lucide-react';

interface PollsEmptyStateProps {
  containerClassName?: string;
}

export const PollsEmptyState = ({ containerClassName }: PollsEmptyStateProps) => {
  return (
    <div className={containerClassName ?? 'text-center py-10'}>
      <div className="text-center py-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <BarChart3 size={28} className="text-primary" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">No polls yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
          Ask the group a question, gather votes in real time, and keep the discussion right under
          the poll.
        </p>
      </div>
    </div>
  );
};
