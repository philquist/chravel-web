import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const MessageSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map(i => (
      <div key={i} className={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const TaskSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map(i => (
      <div key={i} className="bg-muted/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-6 h-6 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const CalendarSkeleton = () => (
  <div className="space-y-4">
    <div className="bg-muted/30 rounded-xl p-6">
      <Skeleton className="h-6 w-1/3 mb-4" />
      {/* One container animation instead of 35 per-cell shimmers — the grid is
          large enough that per-element background animations cost real paint
          time on low-end mobile. Cells stay on the muted token. */}
      <div className="grid grid-cols-7 gap-2 animate-pulse">
        {Array(35)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="aspect-square bg-muted/50 rounded" />
          ))}
      </div>
    </div>
  </div>
);
