import React from 'react';
import { CalendarEvent } from '@/types/calendar';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Clock, MapPin, Trash2, Pencil, Sun, CalendarDays, Repeat, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EventItemProps {
  event: CalendarEvent;
  onEdit?: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  isDeleting?: boolean;
}

export const EventItem = ({ event, onEdit, onDelete, isDeleting = false }: EventItemProps) => {
  const categoryEmojis: Record<string, string> = {
    dining: '🍽️',
    lodging: '🏨',
    activity: '🎯',
    transportation: '🚗',
    entertainment: '🎭',
    other: '📌',
  };

  const sourceData = event.source_data as Record<string, unknown> | undefined;
  const hasReminder = sourceData?.reminder_minutes != null;
  const reminderMinutes = hasReminder ? (sourceData?.reminder_minutes as number) : null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{categoryEmojis[event.event_category] || '📌'}</span>
            <h4 className="font-medium text-foreground">{event.title}</h4>
            {event.recurrence_rule && (
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-label="Recurring event" />
            )}
            {hasReminder && (
              <Bell
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-label={
                  reminderMinutes != null && reminderMinutes >= 60
                    ? `Reminder: ${Math.floor(reminderMinutes / 60)}h before`
                    : `Reminder: ${reminderMinutes}m before`
                }
              />
            )}
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            {event.is_all_day ? (
              <div className="flex items-center gap-2">
                {event.end_date &&
                event.end_date.toISOString().slice(0, 10) !==
                  event.date.toISOString().slice(0, 10) ? (
                  <>
                    <CalendarDays className="h-4 w-4" />
                    <span>
                      {format(event.date, 'MMM d')} - {format(event.end_date, 'MMM d')}
                    </span>
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4" />
                    <span>All day</span>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>
                  {event.time}
                  {event.end_time && ` - ${format(event.end_time, 'HH:mm')}`}
                </span>
              </div>
            )}

            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
            )}

            {/* Availability badge */}
            {event.availability_status && event.availability_status !== 'busy' && (
              <span
                className={cn(
                  'inline-block text-xs px-2 py-0.5 rounded-full',
                  event.availability_status === 'free' && 'bg-green-500/20 text-green-400',
                  event.availability_status === 'tentative' && 'bg-yellow-500/20 text-yellow-400',
                )}
              >
                {event.availability_status}
              </span>
            )}
          </div>

          {event.description && (
            <p className="text-sm text-muted-foreground mt-2">{event.description}</p>
          )}
        </div>

        <div className="flex gap-1">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(event)}
              className="hover:bg-primary/10 hover:text-primary"
              title="Edit event"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={isDeleting}
                title="Delete event"
              >
                {isDeleting ? (
                  <span className="h-4 w-4 inline-flex items-center justify-center">
                    <span className="animate-spin h-4 w-4 gold-gradient-spinner" />
                  </span>
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Event</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove &ldquo;{event.title}&rdquo; from the calendar. This
                  action cannot be undone.
                  {event.recurrence_rule && (
                    <span className="block mt-2 text-amber-500">
                      This is a recurring event. Deleting will remove all occurrences.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(event.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};
