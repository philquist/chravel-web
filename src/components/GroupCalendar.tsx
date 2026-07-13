import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ItineraryView } from './ItineraryView';
import { useCalendarManagement } from '@/features/calendar/hooks/useCalendarManagement';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/queryKeys';
import { CalendarHeader } from '@/features/calendar/components/CalendarHeader';
import { CalendarGrid } from '@/features/calendar/components/CalendarGrid';
import { CalendarEventModal } from '@/features/calendar/components/CalendarEventModal';
import { EventList } from '@/features/calendar/components/EventList';
import { CalendarImportModal } from '@/features/calendar/components/CalendarImportModal';
import { useCalendarExport } from '@/features/calendar/hooks/useCalendarExport';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBackgroundImport } from '@/features/calendar/hooks/useBackgroundImport';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { useDeferredPaidAccess } from '@/hooks/useDeferredPaidAccess';
import type { CalendarEvent } from '@/types/calendar';
import { CalendarErrorState } from '@/features/calendar/components/CalendarErrorState';
import { ExportDialog } from '@/features/calendar/components/ExportDialog';
import { CalendarLoadingState } from '@/features/calendar/components/CalendarLoadingState';
import { CalendarEmptyState } from '@/features/calendar/components/CalendarEmptyState';

interface GroupCalendarProps {
  tripId: string;
}

export const GroupCalendar = React.memo(({ tripId }: GroupCalendarProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    events,
    tripEvents,
    showAddEvent,
    setShowAddEvent,
    editingEvent,
    setEditingEvent,
    viewMode,
    toggleViewMode,
    updateEventField,
    getEventsForDate,
    deleteEvent,
    resetForm,
    isLoading,
    isFetching,
    isSaving,
    isError,
    error,
    refreshEvents,
  } = useCalendarManagement(tripId);
  const { toast } = useToast();
  const { canPerformAction, isLoading: permissionsLoading } = useRolePermissions(tripId);
  const { tier, subscription, isSuperAdmin } = useConsumerSubscription();
  // Demo mode available for future conditional rendering
  const { isDemoMode: _isDemoMode } = useDemoMode();
  const canUseSmartImport = useDeferredPaidAccess({
    tier,
    status: subscription?.status,
    isSuperAdmin,
    active: true,
  });

  // Background URL import
  const {
    pendingResult: backgroundPendingResult,
    startImport: startBackgroundImport,
    clearResult: clearBackgroundResult,
  } = useBackgroundImport();

  // Shared ICS export
  const { exportTripEvents } = useCalendarExport(tripId);

  // ICS Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Callback for background import: opens the modal with results when the toast action is clicked
  const handleBackgroundImportComplete = useCallback(() => {
    setShowImportModal(true);
  }, []);

  const handleStartBackgroundImport = useCallback(
    (url: string) => {
      startBackgroundImport(url, handleBackgroundImportComplete, { tripId });
    },
    [startBackgroundImport, handleBackgroundImportComplete, tripId],
  );

  const handleImport = useCallback(async () => {
    // Allow action optimistically while permissions are still loading
    if (!permissionsLoading && !canPerformAction('calendar', 'can_edit_events')) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to import events',
        variant: 'destructive',
      });
      return;
    }

    if (!canUseSmartImport) {
      const { getFeaturePaywallConfig } = await import('@/components/subscription/featurePaywall');
      const paywall = getFeaturePaywallConfig('smart_import_calendar');
      toast({
        title: 'Upgrade required',
        description: `${paywall.featureBenefitCopy} Recommended plan: ${paywall.recommendedPlan}.`,
        action: (
          <ToastAction
            altText="View Plans"
            onClick={() =>
              navigate(
                `${paywall.destination.pathname}${paywall.destination.search}`,
                paywall.destination.state ? { state: paywall.destination.state } : undefined,
              )
            }
          >
            View Plans
          </ToastAction>
        ),
      });
      return;
    }
    setShowImportModal(true);
  }, [permissionsLoading, canPerformAction, canUseSmartImport, toast, navigate]);

  const handleImportComplete = useCallback(async () => {
    // Wait for queries to settle before attempting a refetch
    await queryClient.cancelQueries({ queryKey: tripKeys.calendar(tripId) });
    await queryClient.invalidateQueries({ queryKey: tripKeys.calendar(tripId) });
    await refreshEvents();
  }, [queryClient, refreshEvents, tripId]);

  const handleEdit = (event: CalendarEvent) => {
    // Check permissions (will return true in Demo Mode)
    if (!canPerformAction('calendar', 'can_edit_events')) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to edit events',
        variant: 'destructive',
      });
      return;
    }
    setEditingEvent(event);
    setShowAddEvent(true);
    // Populate form with event data
    updateEventField('title', event.title);
    updateEventField('time', event.time);
    updateEventField('location', event.location || '');
    updateEventField('description', event.description || '');
    updateEventField('category', event.event_category || 'other');
    updateEventField('include_in_itinerary', event.include_in_itinerary ?? true);
  };

  const handleFormCancel = () => {
    setEditingEvent(null);
    resetForm();
  };

  const handleExport = () => {
    setShowExportDialog(true);
  };

  const handleExportEvents = async (eventsToExport: typeof tripEvents) => {
    try {
      await exportTripEvents(eventsToExport);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to export calendar:', error);
      }
      toast({
        title: 'Export failed',
        description: 'Unable to export calendar. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];
  const datesWithEvents = events.map(event => event.date);

  if (!tripId) {
    return (
      <div className="p-6">
        <div className="bg-card/50 backdrop-blur-sm border border-border rounded-lg p-6 text-center text-muted-foreground">
          Trip calendar is unavailable without a valid trip.
        </div>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="p-6">
        <CalendarHeader
          viewMode={viewMode}
          onToggleView={toggleViewMode}
          onAddEvent={() => setShowAddEvent(!showAddEvent)}
          onExport={handleExport}
          onImport={handleImport}
        />

        {isError ? (
          <CalendarErrorState
            error={error instanceof Error ? error : error ? new Error(String(error)) : undefined}
            onRetry={refreshEvents}
            isRetrying={isFetching}
          />
        ) : isLoading ? (
          <CalendarLoadingState variant="grid" />
        ) : events.length === 0 ? (
          <CalendarEmptyState onAddEvent={() => setShowAddEvent(true)} />
        ) : (
          <CalendarGrid
            events={events}
            selectedDate={selectedDate || new Date()}
            onSelectDate={setSelectedDate}
            onAddEvent={date => {
              setSelectedDate(date);
              setShowAddEvent(true);
            }}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
          />
        )}

        {/* Event Modal */}
        <CalendarEventModal
          isOpen={showAddEvent}
          onClose={() => {
            setShowAddEvent(false);
            setEditingEvent(null);
            resetForm();
          }}
          tripId={tripId}
          editEvent={editingEvent || undefined}
          prefilledData={selectedDate ? { date: selectedDate } : undefined}
          onEventAdded={() => {
            setShowAddEvent(false);
            setEditingEvent(null);
            resetForm();
            refreshEvents();
          }}
        />

        {/* ICS Import Modal */}
        <CalendarImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          tripId={tripId}
          existingEvents={tripEvents}
          onImportComplete={handleImportComplete}
          pendingResult={backgroundPendingResult}
          onClearPendingResult={clearBackgroundResult}
          onStartBackgroundImport={handleStartBackgroundImport}
        />
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          tripEvents={tripEvents}
          onExport={handleExportEvents}
        />
      </div>
    );
  }

  if (viewMode === 'itinerary') {
    return (
      <div className="p-6">
        <CalendarHeader
          viewMode={viewMode}
          onToggleView={toggleViewMode}
          onAddEvent={() => setShowAddEvent(!showAddEvent)}
          onExport={handleExport}
          onImport={handleImport}
        />
        {isError ? (
          <CalendarErrorState
            error={error instanceof Error ? error : error ? new Error(String(error)) : undefined}
            onRetry={refreshEvents}
            isRetrying={isFetching}
          />
        ) : (
          <ItineraryView events={events} tripName="Trip Itinerary" tripId={tripId} />
        )}

        {/* ICS Import Modal */}
        <CalendarImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          tripId={tripId}
          existingEvents={tripEvents}
          onImportComplete={handleImportComplete}
          pendingResult={backgroundPendingResult}
          onClearPendingResult={clearBackgroundResult}
          onStartBackgroundImport={handleStartBackgroundImport}
        />
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          tripEvents={tripEvents}
          onExport={handleExportEvents}
        />
      </div>
    );
  }

  return (
    <div className="px-0 py-6">
      <CalendarHeader
        viewMode={viewMode}
        onToggleView={toggleViewMode}
        onAddEvent={() => setShowAddEvent(!showAddEvent)}
        onExport={handleExport}
        onImport={handleImport}
      />

      {isError ? (
        <CalendarErrorState
          error={error instanceof Error ? error : error ? new Error(String(error)) : undefined}
          onRetry={refreshEvents}
          isRetrying={isFetching}
        />
      ) : isLoading ? (
        <CalendarLoadingState variant="split" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:h-[420px]">
          <div className="bg-glass-slate-card border border-glass-slate-border rounded-2xl p-2 flex items-center h-full shadow-enterprise-lg">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="w-full"
              modifiers={{
                hasEvents: datesWithEvents,
              }}
              modifiersStyles={{
                hasEvents: {
                  backgroundColor: 'rgba(196, 151, 70, 0.3)',
                  color: '#feeaa5',
                  fontWeight: 'bold',
                },
              }}
            />
          </div>

          <div className="bg-glass-slate-card border border-glass-slate-border rounded-2xl p-4 flex flex-col h-full shadow-enterprise-lg">
            <h3 className="text-foreground font-medium mb-3">
              {selectedDate
                ? `Events for ${format(selectedDate, 'EEEE, MMM d')}`
                : 'Select a date to view events'}
            </h3>

            <div className="flex-1 overflow-y-auto">
              {selectedDateEvents.length > 0 ? (
                <EventList
                  events={selectedDateEvents}
                  onEdit={handleEdit}
                  onDelete={deleteEvent}
                  emptyMessage=""
                  isDeleting={isSaving}
                />
              ) : (
                <p className="text-gray-400 text-sm mt-6 text-center">
                  {selectedDate
                    ? 'No events scheduled for this day.'
                    : 'Select a date to view events.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      <CalendarEventModal
        isOpen={showAddEvent}
        onClose={handleFormCancel}
        tripId={tripId}
        editEvent={editingEvent || undefined}
        prefilledData={selectedDate ? { date: selectedDate } : undefined}
        onEventAdded={() => {
          setShowAddEvent(false);
          setEditingEvent(null);
          resetForm();
          refreshEvents();
        }}
      />

      {/* ICS Import Modal */}
      <CalendarImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        tripId={tripId}
        existingEvents={tripEvents}
        onImportComplete={handleImportComplete}
        pendingResult={backgroundPendingResult}
        onClearPendingResult={clearBackgroundResult}
        onStartBackgroundImport={handleStartBackgroundImport}
      />
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        tripEvents={tripEvents}
        onExport={handleExportEvents}
      />
    </div>
  );
});
