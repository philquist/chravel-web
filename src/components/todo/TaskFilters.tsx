import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '../ui/button';
import { TaskStatus, TaskSortBy } from '../../hooks/useTripTasks';

interface TaskFiltersProps {
  status: TaskStatus;
  sortBy: TaskSortBy;
  onStatusChange: (status: TaskStatus) => void;
  onSortChange: (sortBy: TaskSortBy) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export const TaskFilters = ({
  status,
  sortBy,
  onStatusChange,
  onSortChange,
  hasActiveFilters,
  onClearFilters,
}: TaskFiltersProps) => {
  const statuses: TaskStatus[] = ['all', 'open', 'completed'];
  const sortOptions: { value: TaskSortBy; label: string }[] = [
    { value: 'dueDate', label: 'Due Date' },
    { value: 'created', label: 'Created' },
    { value: 'priority', label: 'Priority' },
  ];

  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 md:px-4">
      <div className="flex items-center gap-3 flex-wrap md:justify-end">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Filter size={16} />
          <span>Filter:</span>
        </div>

        <div className="flex gap-2">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              aria-label={`Filter tasks by ${s}`}
              aria-pressed={status === s}
              className={`px-4 py-2 min-h-[44px] min-w-[88px] rounded-full text-xs font-medium transition-all capitalize flex items-center justify-center ${
                status === s
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                  : 'bg-gray-800/80 text-white border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-slate-400 text-sm">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => onSortChange(e.target.value as TaskSortBy)}
            aria-label="Sort tasks by"
            className="bg-slate-700 text-white text-xs rounded px-2 py-2 min-h-[44px] border border-slate-600"
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            aria-label="Clear all filters"
            className="text-slate-400 hover:text-white min-h-[44px]"
          >
            <X size={14} className="mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
