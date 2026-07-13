import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/queryKeys';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  X,
  Pencil,
  Trash2,
  Download,
  Upload,
  CalendarDays,
  List,
} from 'lucide-react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { CalendarSkeleton } from './SkeletonLoader';
import { hapticService } from '../../services/hapticService';
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { CreateEventModal } from './CreateEventModal';
import { CalendarImportModal } from '@/features/calendar/components/CalendarImportModal';
import { useCalendarEvents } from '@/features/calendar/hooks/useCalendarEvents';
import { demoModeService } from '@/services/demoModeService';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBackgroundImport } from '@/features/calendar/hooks/useBackgroundImport';
import { toast } from 'sonner';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { useDeferredPaidAccess } from '@/hooks/useDeferredPaidAccess';
import { useSmartImportTaste } from '@/features/smart-import/hooks/useSmartImportTaste';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useTripMembersQuery } from '@/hooks/useTripMembersQuery';
import type { TripEvent } from '@/services/calendarService';
import { useCalendarExport } from '@/features/calendar/hooks/useCalendarExport';
import { CalendarErrorState } from '@/features/calendar/components/CalendarErrorState';

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  time: string;
  endTime?: string;
  location?: string;
  participants: number;
  color: string;
  originalEvent?: TripEvent;
}

type CalendarViewMode = 'list' | 'grid';

const formatEventClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const formatEventTimeRange = (startIso: string, endIso?: string | null): string => {
  const start = formatEventClock(startIso);
  if (!endIso) return start;
  return `${start} – ${formatEventClock(endIso)}`;
};

interface MobileGroupCalendarProps {
  tripId: string;
  onExport?: () => void;
  onImport?: () => void;
  onToggleView?: () => void;
  viewMode?: CalendarViewMode;
}

// Color gradients for events
const EVENT_COLORS = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-pink-500 to-pink-600',
  'from-green-500 to-green-600',
  'from-yellow-500 to-yellow-600',
  'from-indigo-500 to-indigo-600',
  'from-red-500 to-red-600',
  'from-teal-500 to-teal-600',
];

export const MobileGroupCalendar = ({
  tripId,
  onExport,
  onImport,
  onToggleView,
  viewMode: externalViewMode,
}: MobileGroupCalendarProps) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TripEvent | null>(null);
  // Internal view mode state when no external handler provided
  const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>('list');
  const { tier, subscription, isSuperAdmin } = useConsumerSubscription();
  const canUseSmartImport = useDeferredPaidAccess({
    tier,
    status: subscription?.status,
    isSuperAdmin,
    active: true,
  });
  // Free-tier "taste": 1 Smart Import per trip before the paywall fires.
  const { canUseFreeImport, invalidateTaste } = useSmartImportTaste(tripId);
  const { canPerformAction, isLoading: permissionsLoading } = useRolePermissions(tripId);
  const { tripMembers } = useTripMembersQuery(tripId);

  // Background URL import
  const {
    pendingResult: backgroundPendingResult,
    startImport: startBackgroundImport,
    clearResult: clearBackgroundResult,
  } = useBackgroundImport();

  const handleBackgroundImportComplete = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  const handleStartBackgroundImport = useCallback(
    (url: string) => {
      startBackgroundImport(url, handleBackgroundImportComplete, { tripId });
    },
    [startBackgroundImport, handleBackgroundImportComplete, tripId],
  );

  // Use external view mode if provided, otherwise use internal state
  const currentViewMode = externalViewMode ?? internalViewMode;

  const setViewMode = (mode: CalendarViewMode) => {
    if (mode === currentViewMode) return;
    void hapticService.light();
    // Only toggle via parent when it also owns the controlled viewMode prop.
    if (externalViewMode !== undefined && onToggleView) {
      onToggleView();
    } else {
      setInternalViewMode(mode);
    }
  };

  const handleImport = async () => {
    await hapticService.medium();

    // Free users get 1 Smart Import per trip before the paywall fires.
    if (!canUseSmartImport && !canUseFreeImport) {
      const { getFeaturePaywallConfig } = await import('@/components/subscription/featurePaywall');
      const paywall = getFeaturePaywallConfig('smart_import_calendar');
      toast.error(
        `You've used your free Smart Import for this trip. ${paywall.recommendedPlan} includes unlimited Smart Import.`,
        {
          action: {
            label: 'View Plans',
            onClick: () =>
              navigate(
                `${paywall.destination.pathname}${paywall.destination.search}`,
                paywall.destination.state ? { state: paywall.destination.state } : undefined,
              ),
          },
        },
      );
      return;
    }

    if (onImport) {
      onImport();
    } else {
      setIsImportModalOpen(true);
    }
  };

  const queryClient = useQueryClient();

  const handleImportComplete = async () => {
    await queryClient.cancelQueries({ queryKey: tripKeys.calendar(tripId) });
    await queryClient.invalidateQueries({ queryKey: tripKeys.calendar(tripId) });
    // Refresh the free-import taste so the next attempt sees consumed usage.
    invalidateTaste();
    await refreshEvents();
  };

  // Use the calendar events hook to fetch real events
  const {
    events: tripEvents,
    loading,
    isFetching,
    isError,
    error,
    refreshEvents,
    deleteEvent,
    updateEvent: _updateEvent,
  } = useCalendarEvents(tripId);

  const { exportTripEvents } = useCalendarExport(tripId);

  const { isDemoMode } = useDemoMode();

  // Convert TripEvent[] to CalendarEvent[] format for UI
  const events = useMemo(() => {
    // Demo-mode parity with desktop GroupCalendar (useCalendarManagement):
    // the Cancun demo trip injects dynamic events for the selected date so
    // the day list is never empty while exploring.
    let sourceEvents = tripEvents;
    if (isDemoMode && tripId === '1') {
      const dynamicDemoEvents = demoModeService.getDynamicDemoEventsForDate(tripId, selectedDate);
      const existingIds = new Set(tripEvents.map(e => e.id));
      sourceEvents = [...tripEvents, ...dynamicDemoEvents.filter(e => !existingIds.has(e.id))];
    }
    const calendarEvents = sourceEvents.map((event, index) => {
      const calendarEvent: CalendarEvent = {
        id: event.id,
        title: event.title,
        date: new Date(event.start_time),
        time: formatEventTimeRange(event.start_time, event.end_time),
        endTime: event.end_time ? formatEventClock(event.end_time) : undefined,
        location: event.location || undefined,
        participants: tripMembers?.length || 0,
        color: EVENT_COLORS[index % EVENT_COLORS.length],
        // Keep original event data for editing
        originalEvent: event,
      };
      return calendarEvent;
    });
    return calendarEvents;
  }, [tripEvents, tripMembers?.length, isDemoMode, tripId, selectedDate]);

  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      await refreshEvents();
    },
  });

  const handleAddEvent = async () => {
    await hapticService.medium();
    if (!permissionsLoading && !canPerformAction('calendar', 'can_create_events')) {
      toast.error('You do not have permission to add events');
      return;
    }
    setEditingEvent(null);
    setIsModalOpen(true);
  };

  // Generate calendar days for the current month view (complete weeks only — no forced 6-row pad)
  const generateCalendarDays = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const startDay = start.getDay(); // 0 = Sunday
    const totalDays = end.getDate();

    const days: Date[] = [];

    // Add padding days from previous month
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(start);
      date.setDate(date.getDate() - i - 1);
      days.push(date);
    }

    // Add all days of current month
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
    }

    // Pad only to finish the final week so short months stay visually compact
    while (days.length % 7 !== 0) {
      const lastDate = days[days.length - 1];
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
      days.push(nextDate);
    }

    return days;
  };

  const calendarDays = generateCalendarDays();
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const handlePreviousMonth = async () => {
    await hapticService.light();
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = async () => {
    await hapticService.light();
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleDateSelect = async (date: Date) => {
    await hapticService.light();
    setSelectedDate(date);
  };

  const eventsForSelectedDate = events.filter(event => isSameDay(event.date, selectedDate));

  // Handle event click to show details
  const handleEventClick = useCallback(
    async (event: CalendarEvent & { originalEvent?: TripEvent | Record<string, unknown> }) => {
      await hapticService.medium();
      setSelectedEvent(event);
    },
    [],
  );

  // Handle event deletion
  const handleDeleteEvent = useCallback(
    async (eventId: string) => {
      if (!eventId) return;
      if (!permissionsLoading && !canPerformAction('calendar', 'can_delete_events')) {
        toast.error('You do not have permission to delete events');
        return;
      }

      setIsDeleting(true);
      try {
        await hapticService.medium();
        const success = await deleteEvent(eventId);
        if (success) {
          toast.success('Event deleted');
          setSelectedEvent(null);
          await refreshEvents();
        } else {
          toast.error('Failed to delete event');
        }
      } catch (error) {
        console.error('Error deleting event:', error);
        toast.error('Failed to delete event');
      } finally {
        setIsDeleting(false);
      }
    },
    [deleteEvent, refreshEvents, canPerformAction, permissionsLoading],
  );

  // Handle event edit
  const handleEditEvent = useCallback(
    async (event: CalendarEvent & { originalEvent?: TripEvent }) => {
      await hapticService.medium();
      if (!permissionsLoading && !canPerformAction('calendar', 'can_edit_events')) {
        toast.error('You do not have permission to edit events');
        return;
      }
      setSelectedEvent(null);
      // Use originalEvent if available, otherwise construct from CalendarEvent
      const eventToEdit: TripEvent = event.originalEvent || {
        id: event.id,
        trip_id: tripId,
        title: event.title,
        start_time: event.date.toISOString(),
        location: event.location,
        event_category: 'other',
        include_in_itinerary: true,
        source_type: 'manual',
        source_data: {},
        created_by: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setEditingEvent(eventToEdit);
      setIsModalOpen(true);
    },
    [tripId, canPerformAction, permissionsLoading],
  );

  // Close event detail drawer
  const handleCloseEventDetail = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleExportClick = async () => {
    await hapticService.light();
    if (onExport) {
      onExport();
    } else {
      await exportTripEvents(tripEvents);
    }
  };

  const renderDayEventCard = (event: CalendarEvent) => (
    <button
      key={event.id}
      type="button"
      onClick={() => handleEventClick(event)}
      data-testid="calendar-day-event-card"
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-transform active:scale-[0.98] hover:bg-white/10"
    >
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b ${event.color}`}
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-base font-semibold text-white">{event.title}</h4>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-300">
            <Clock size={14} className="shrink-0 text-gold-primary" />
            <span>{event.time}</span>
          </div>
          {event.location && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500">
            <Users size={14} className="shrink-0" />
            <span>{event.participants} attending</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-gold-light">
          {event.time.split(' – ')[0]}
        </span>
      </div>
    </button>
  );

  const renderCompactCalendar = (opts: { density: 'day' | 'month'; showEventTitles?: boolean }) => {
    const isDayDensity = opts.density === 'day';
    const cellHeight = isDayDensity ? 'h-7' : 'h-9';
    const daySize = isDayDensity ? 'size-7 text-xs' : 'size-8 text-sm';

    return (
      <div
        data-testid={isDayDensity ? 'calendar-day-mini-grid' : 'calendar-month-grid'}
        className={[
          'shrink-0 overflow-hidden border-t border-white/10 bg-black/40 px-3 pb-3 pt-2',
          // Hard cap: calendar never claims more than the bottom half of the panel
          isDayDensity ? 'max-h-[42%]' : 'max-h-[48%]',
        ].join(' ')}
      >
        <div className="mb-1 flex shrink-0 items-center justify-between py-1">
          <button
            type="button"
            onClick={handlePreviousMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-white/10 active:scale-95"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} className="text-gray-400" />
          </button>
          <span className="text-sm font-semibold text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-white/10 active:scale-95"
            aria-label="Next month"
          >
            <ChevronRight size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="mb-0.5 grid grid-cols-7 gap-0.5">
          {weekDays.map((day, index) => (
            <div
              key={`weekday-${opts.density}-${index}`}
              className="py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((date, index) => {
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, new Date());
            const dayEvents = events.filter(e => isSameDay(e.date, date));
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={`${opts.density}-day-${index}`}
                type="button"
                onClick={() => handleDateSelect(date)}
                aria-label={`${format(date, 'EEEE, MMMM d')}${hasEvents ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                aria-selected={isSelected}
                className={[
                  'relative flex w-full flex-col items-center justify-start rounded-lg transition-all duration-150 active:scale-95',
                  cellHeight,
                  !isSelected ? 'hover:bg-white/10' : '',
                  opts.showEventTitles ? 'min-h-[2.75rem] py-0.5' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex shrink-0 items-center justify-center rounded-full font-medium',
                    daySize,
                    isSelected
                      ? 'bg-gold-primary text-primary-foreground'
                      : !isCurrentMonth
                        ? 'text-gray-600'
                        : isToday
                          ? 'bg-gold-primary/20 text-gold-light'
                          : 'text-gray-300',
                  ].join(' ')}
                >
                  {format(date, 'd')}
                </span>
                {opts.showEventTitles && hasEvents ? (
                  <span className="mt-0.5 w-full truncate px-0.5 text-center text-[9px] leading-tight text-gold-light/90">
                    {dayEvents[0].title}
                  </span>
                ) : (
                  hasEvents &&
                  !isSelected && (
                    <span className="pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-primary" />
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full flex-col bg-black" data-testid="mobile-group-calendar">
      <PullToRefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        threshold={80}
      />

      {loading ? (
        <div className="px-4 py-4">
          <CalendarSkeleton />
        </div>
      ) : isError ? (
        <CalendarErrorState
          error={error instanceof Error ? error : new Error(String(error))}
          onRetry={refreshEvents}
          isRetrying={isFetching}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Day / Month segmented control — makes the two modes unmistakably distinct */}
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <div
              role="tablist"
              aria-label="Calendar view"
              className="flex flex-1 rounded-full bg-white/5 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={currentViewMode === 'list'}
                data-testid="calendar-view-day"
                onClick={() => setViewMode('list')}
                className={[
                  'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]',
                  currentViewMode === 'list'
                    ? 'bg-primary/15 text-gold-light shadow-ring-glow ring-1 ring-primary/50'
                    : 'text-gray-400 hover:text-white',
                ].join(' ')}
              >
                <List size={14} />
                Day
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={currentViewMode === 'grid'}
                data-testid="calendar-view-month"
                onClick={() => setViewMode('grid')}
                className={[
                  'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]',
                  currentViewMode === 'grid'
                    ? 'bg-primary/15 text-gold-light shadow-ring-glow ring-1 ring-primary/50'
                    : 'text-gray-400 hover:text-white',
                ].join(' ')}
              >
                <CalendarDays size={14} />
                Month
              </button>
            </div>
            <button
              type="button"
              onClick={handleAddEvent}
              className="flex min-h-[44px] items-center gap-1 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
              aria-label="Add event"
            >
              <Plus size={16} />
              New
            </button>
          </div>

          {/* Secondary actions */}
          <div className="flex shrink-0 justify-center gap-2 border-b border-white/5 px-4 py-2">
            <button
              type="button"
              onClick={handleImport}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/5 px-3 text-xs text-gray-300 transition-colors hover:bg-white/10 active:scale-95"
            >
              <Upload size={14} />
              Import
            </button>
            <button
              type="button"
              onClick={handleExportClick}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/5 px-3 text-xs text-gray-300 transition-colors hover:bg-white/10 active:scale-95"
            >
              <Download size={14} />
              Export
            </button>
          </div>

          {/* DAY VIEW: agenda-first listings, mini calendar capped to bottom half */}
          {currentViewMode === 'list' && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              data-testid="calendar-day-view"
              data-view="day"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      {format(selectedDate, 'MMMM yyyy')}
                    </p>
                    <h3 className="truncate text-xl font-semibold tracking-tight text-white">
                      {format(selectedDate, 'EEEE, MMMM d')}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEvent}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
                    aria-label="Add event for selected day"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-3">
                  {eventsForSelectedDate.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                      <p className="text-sm text-gray-400">No events for this day.</p>
                      <button
                        type="button"
                        onClick={handleAddEvent}
                        className="mt-3 text-sm font-medium text-gold-light underline-offset-2 hover:underline"
                      >
                        Add your first event
                      </button>
                    </div>
                  ) : (
                    eventsForSelectedDate.map(renderDayEventCard)
                  )}
                </div>
              </div>

              {renderCompactCalendar({ density: 'day' })}
            </div>
          )}

          {/* MONTH VIEW: capped month overview + selected-day agenda strip */}
          {currentViewMode === 'grid' && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              data-testid="calendar-month-view"
              data-view="month"
            >
              {renderCompactCalendar({ density: 'month', showEventTitles: true })}

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-white">
                    Events for {format(selectedDate, 'EEEE, MMM d')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className="text-xs font-medium text-gold-light underline-offset-2 hover:underline"
                  >
                    Open Day view
                  </button>
                </div>

                <div className="space-y-2.5">
                  {eventsForSelectedDate.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      No events scheduled for this day.
                    </p>
                  ) : (
                    eventsForSelectedDate.map(event => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => handleEventClick(event)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10 active:scale-[0.99]"
                      >
                        <span
                          className={`h-10 w-1 shrink-0 rounded-full bg-gradient-to-b ${event.color}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white">{event.title}</p>
                          <p className="truncate text-xs text-gray-400">
                            {event.time}
                            {event.location ? ` · ${event.location}` : ''}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Event Modal */}
      <CreateEventModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEvent(null);
        }}
        selectedDate={selectedDate}
        tripId={tripId}
        editEvent={editingEvent}
        onEventCreated={async () => {
          // Refresh events after creation to get the latest data
          await refreshEvents();
        }}
        onEventUpdated={async () => {
          // Refresh events after update to get the latest data
          await refreshEvents();
        }}
      />

      {/* Calendar Import Modal */}
      <CalendarImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tripId={tripId}
        existingEvents={tripEvents}
        onImportComplete={handleImportComplete}
        pendingResult={backgroundPendingResult}
        onClearPendingResult={clearBackgroundResult}
        onStartBackgroundImport={handleStartBackgroundImport}
      />

      {/* Event Detail Drawer - portaled to body so z-index escapes tab stacking context */}
      {selectedEvent &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseEventDetail}
            />

            {/* Drawer - cap height below mobile header + tabs */}
            <div
              className="relative w-full max-w-md bg-glass-slate-card border-t border-glass-slate-border rounded-t-3xl shadow-enterprise-lg animate-slide-up overflow-y-auto"
              style={{
                maxHeight:
                  'calc(100dvh - var(--mobile-header-h, 73px) - var(--mobile-tabs-h, 52px) - 16px)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-start justify-between px-6 pb-4">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white mb-1">{selectedEvent.title}</h2>
                  <p className="text-sm text-gray-400">
                    {format(selectedEvent.date, 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
                <button
                  onClick={handleCloseEventDetail}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Event Details */}
              <div className="px-6 pb-6 space-y-4">
                {/* Time */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Time</p>
                    <p className="text-white font-medium">{selectedEvent.time}</p>
                  </div>
                </div>

                {/* Location */}
                {selectedEvent.location && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Location</p>
                      <p className="text-white font-medium">{selectedEvent.location}</p>
                    </div>
                  </div>
                )}

                {/* Participants */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Attending</p>
                    <p className="text-white font-medium">{selectedEvent.participants} people</p>
                  </div>
                </div>
              </div>

              {/* Actions - only show when user has permission */}
              {(canPerformAction('calendar', 'can_edit_events') ||
                canPerformAction('calendar', 'can_delete_events')) && (
                <div className="px-6 pb-8 flex gap-3">
                  {canPerformAction('calendar', 'can_edit_events') && (
                    <button
                      onClick={() =>
                        handleEditEvent(
                          selectedEvent as CalendarEvent & { originalEvent?: TripEvent },
                        )
                      }
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-xl transition-colors"
                    >
                      <Pencil size={18} />
                      <span>Edit</span>
                    </button>
                  )}
                  {canPerformAction('calendar', 'can_delete_events') && (
                    <button
                      onClick={() => handleDeleteEvent(selectedEvent.id)}
                      disabled={isDeleting}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                      <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
