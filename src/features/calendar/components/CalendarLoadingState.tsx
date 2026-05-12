import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface CalendarLoadingStateProps {
  variant: 'grid' | 'split';
}

export const CalendarLoadingState = ({ variant }: CalendarLoadingStateProps) => {
  if (variant === 'grid') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading calendar">
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-6 w-36 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <div className="grid grid-cols-7 border-b border-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-2 flex justify-center">
                <Skeleton className="h-4 w-8 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[100px] md:min-h-[120px] p-2 border-b border-r border-border"
              >
                <Skeleton className="h-4 w-4 rounded mb-2" />
                {i % 5 === 0 && <Skeleton className="h-3 w-16 rounded" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-6 md:h-[420px]"
      aria-busy="true"
      aria-label="Loading calendar"
    >
      <div className="bg-glass-slate-card border border-glass-slate-border rounded-2xl p-4 flex flex-col gap-3 h-full shadow-enterprise-lg">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-28 rounded" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded" />
          ))}
        </div>
      </div>
      <div className="bg-glass-slate-card border border-glass-slate-border rounded-2xl p-4 flex flex-col h-full shadow-enterprise-lg">
        <Skeleton className="h-5 w-48 rounded mb-4" />
        <div className="space-y-3 flex-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
};
