import React, { useState, useEffect, useRef } from 'react';
import {
  CalendarPlus,
  CheckSquare,
  BarChart3,
  Check,
  X,
  DollarSign,
  Copy,
  Settings2,
} from 'lucide-react';
import type { PendingAction } from '@/hooks/usePendingActions';

interface PendingActionCardProps {
  action: PendingAction;
  title?: string;
  detail?: string | null;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
  isConfirming: boolean;
  isRejecting: boolean;
}

const TOOL_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  createTask: { icon: CheckSquare, label: 'Task', color: 'text-green-400' },
  createPoll: { icon: BarChart3, label: 'Poll', color: 'text-blue-400' },
  addToCalendar: { icon: CalendarPlus, label: 'Calendar Event', color: 'text-purple-400' },
  duplicateCalendarEvent: { icon: Copy, label: 'Duplicate Event', color: 'text-purple-400' },
  bulkMarkTasksDone: { icon: CheckSquare, label: 'Bulk Complete Tasks', color: 'text-green-400' },
  cloneActivity: { icon: Copy, label: 'Clone Activity', color: 'text-purple-400' },
  addExpense: { icon: DollarSign, label: 'Expense', color: 'text-orange-400' },
  updateTripDetails: { icon: Settings2, label: 'Trip Update', color: 'text-blue-400' },
};

function getActionTitle(action: PendingAction): string {
  const payload = action.payload as Record<string, unknown>;
  switch (action.tool_name) {
    case 'createTask':
      return (payload.title as string) || 'Untitled task';
    case 'createPoll':
      return (payload.question as string) || 'Untitled poll';
    case 'addToCalendar':
      return (payload.title as string) || 'Untitled event';
    case 'duplicateCalendarEvent':
      return (payload.source_title as string) || 'Duplicate event';
    case 'bulkMarkTasksDone': {
      const ids = payload.task_ids as unknown[] | undefined;
      const count = Array.isArray(ids) ? ids.length : 0;
      return `Mark ${count} task${count !== 1 ? 's' : ''} complete`;
    }
    case 'cloneActivity': {
      const clones = payload.clones as unknown[] | undefined;
      const count = Array.isArray(clones) ? clones.length : 0;
      const title =
        Array.isArray(clones) && clones.length > 0
          ? ((clones[0] as Record<string, unknown>).title as string)
          : 'Activity';
      return `Clone "${title}" × ${count}`;
    }
    case 'addExpense':
      return (payload.description as string) || 'New expense';
    case 'updateTripDetails': {
      const fields = Object.keys(payload).filter(k => k !== 'trip_id');
      return fields.length > 0 ? `Update trip ${fields.join(', ')}` : 'Update trip details';
    }
    default:
      return 'Unknown action';
  }
}

function getActionDetail(action: PendingAction): string | null {
  const payload = action.payload as Record<string, unknown>;
  switch (action.tool_name) {
    case 'createTask':
      return (payload.description as string) || null;
    case 'createPoll': {
      const options = payload.options as Array<{ text?: string }> | undefined;
      if (!Array.isArray(options)) return null;
      return options
        .map(o => o.text || '')
        .filter(Boolean)
        .join(', ');
    }
    case 'addToCalendar': {
      const parts: string[] = [];
      if (payload.start_time) {
        try {
          parts.push(new Date(payload.start_time as string).toLocaleString());
        } catch {
          // ignore bad date
        }
      }
      if (payload.location) parts.push(payload.location as string);
      return parts.join(' · ') || null;
    }
    case 'duplicateCalendarEvent': {
      const newStart = payload.new_start_time as string | undefined;
      if (!newStart) return null;
      try {
        return `New date: ${new Date(newStart).toLocaleString()}`;
      } catch {
        return null;
      }
    }
    case 'bulkMarkTasksDone':
      return (payload.filter_description as string) || null;
    case 'cloneActivity': {
      const clones = payload.clones as Array<{ start_time?: string }> | undefined;
      if (!Array.isArray(clones) || clones.length === 0) return null;
      try {
        const dates = clones
          .slice(0, 3)
          .map(c => (c.start_time ? new Date(c.start_time).toLocaleDateString() : ''))
          .filter(Boolean);
        return dates.join(', ') + (clones.length > 3 ? ', …' : '');
      } catch {
        return null;
      }
    }
    case 'addExpense': {
      const amount = payload.amount as number | undefined;
      const currency = (payload.currency as string) || 'USD';
      return amount != null ? `${currency} ${amount}` : null;
    }
    case 'updateTripDetails': {
      const name = payload.name as string | undefined;
      const destination = payload.destination as string | undefined;
      return name ? `Name: "${name}"` : destination ? `Destination: ${destination}` : null;
    }
    default:
      return null;
  }
}

export function PendingActionCard({
  action,
  title,
  detail,
  onConfirm,
  onReject,
  isConfirming,
  isRejecting,
}: PendingActionCardProps) {
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handleDismissClick = () => {
    if (confirmingDismiss) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      setConfirmingDismiss(false);
      onReject(action.id);
    } else {
      setConfirmingDismiss(true);
      dismissTimerRef.current = setTimeout(() => {
        setConfirmingDismiss(false);
      }, 3000);
    }
  };

  const config = TOOL_CONFIG[action.tool_name] || {
    icon: CheckSquare,
    label: 'Action',
    color: 'text-gray-400',
  };
  const Icon = config.icon;
  const resolvedTitle = title || getActionTitle(action);
  const resolvedDetail = detail !== undefined ? detail : getActionDetail(action);
  const busy = isConfirming || isRejecting;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-amber-400/80 font-medium">
            AI wants to create a {config.label}
          </p>
          <p className="text-sm text-white font-medium truncate">{resolvedTitle}</p>
          {resolvedDetail && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{resolvedDetail}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(action.id)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium py-1.5 px-3 transition-colors disabled:opacity-50"
        >
          {isConfirming ? (
            <div className="h-3 w-3 animate-spin gold-gradient-spinner" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Confirm
        </button>
        <button
          type="button"
          onClick={handleDismissClick}
          disabled={busy}
          className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-medium py-1.5 px-3 transition-colors disabled:opacity-50 ${
            confirmingDismiss
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
              : 'bg-gray-700/50 hover:bg-gray-700 text-gray-400'
          }`}
        >
          {isRejecting ? (
            <div className="h-3 w-3 animate-spin gold-gradient-spinner" />
          ) : (
            <X className="h-3 w-3" />
          )}
          {confirmingDismiss ? 'Confirm dismiss?' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
