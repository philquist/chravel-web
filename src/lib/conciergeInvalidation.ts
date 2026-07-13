import { tripKeys } from '@/lib/queryKeys';

export type ConciergeInvalidationQueryKey = readonly (string | boolean | undefined)[];

/**
 * All concierge tools that mutate trip state.
 * Must stay in sync with toolRegistry.ts write tools.
 *
 * Grouped by domain for readability:
 *   Calendar: addToCalendar, updateCalendarEvent, deleteCalendarEvent,
 *             bulkDeleteCalendarEvents, emitBulkDeletePreview, emitSmartImportPreview,
 *             duplicateCalendarEvent, moveCalendarEvent, cloneActivity
 *   Tasks:    createTask, updateTask, deleteTask, splitTaskAssignments, bulkMarkTasksDone
 *   Polls:    createPoll, closePoll
 *   Places:   savePlace, emitReservationDraft, makeReservation
 *   Payments: settleExpense, addExpense
 *   Comms:    createBroadcast, createNotification
 *   Trip:     setBasecamp, addToAgenda, setTripHeaderImage, generateTripImage, updateTripDetails
 */
const CONCIERGE_WRITE_ACTIONS = new Set<string>([
  // Calendar
  'addToCalendar',
  'updateCalendarEvent',
  'deleteCalendarEvent',
  'bulkDeleteCalendarEvents',
  'emitBulkDeletePreview',
  'emitSmartImportPreview',
  'duplicateCalendarEvent',
  'moveCalendarEvent',
  'cloneActivity',
  // Tasks
  'createTask',
  'updateTask',
  'deleteTask',
  'splitTaskAssignments',
  'bulkMarkTasksDone',
  // Polls
  'createPoll',
  'closePoll',
  // Places / Reservations
  'savePlace',
  'saveLink',
  'emitReservationDraft',
  'makeReservation',
  // Payments / Expenses
  'settleExpense',
  'addExpense',
  // Broadcasts / Notifications
  'createBroadcast',
  'createNotification',
  // Trip-level
  'setBasecamp',
  'addToAgenda',
  'setTripHeaderImage',
  'generateTripImage',
  'updateTripDetails',
]);

export function isConciergeWriteAction(name: string): boolean {
  return CONCIERGE_WRITE_ACTIONS.has(name);
}

/**
 * Returns an array of query keys to invalidate for a given concierge tool.
 * Multiple keys are returned when a single tool affects more than one cache domain.
 * Returns an empty array for tools with no invalidation mapping.
 */
export function getConciergeInvalidationKeys(
  name: string,
  tripId: string,
): ConciergeInvalidationQueryKey[] {
  switch (name) {
    // Calendar
    case 'addToCalendar':
    case 'updateCalendarEvent':
    case 'deleteCalendarEvent':
    case 'bulkDeleteCalendarEvents':
    case 'emitBulkDeletePreview':
    case 'emitSmartImportPreview':
    case 'duplicateCalendarEvent':
    case 'moveCalendarEvent':
    case 'cloneActivity':
      return [['calendarEvents', tripId]];

    // Tasks
    case 'createTask':
    case 'updateTask':
    case 'deleteTask':
    case 'splitTaskAssignments':
    case 'bulkMarkTasksDone':
      return [['tripTasks', tripId]];

    // Polls
    case 'createPoll':
    case 'closePoll':
      return [tripKeys.polls(tripId)];

    // Places / Reservations / Links — also invalidate tripLinks (shared explore tab)
    case 'savePlace':
    case 'saveLink':
    case 'emitReservationDraft':
    case 'makeReservation':
      return [
        ['tripPlaces', tripId],
        ['tripLinks', tripId],
      ];

    // Payments / Expenses
    case 'settleExpense':
    case 'addExpense':
      return [['tripPayments', tripId]];

    // Broadcasts
    case 'createBroadcast':
      return [['tripBroadcasts', tripId]];

    // Notifications — no dedicated query key; realtime handles updates.
    case 'createNotification':
      return [];

    // Trip-level basecamp — invalidate tripBasecamp query + trip detail + personal basecamp prefix
    case 'setBasecamp':
      return [['tripBasecamp', tripId], ['trip', tripId], ['personalBasecamp']];

    case 'addToAgenda':
      return [['eventAgenda', tripId]];

    case 'setTripHeaderImage':
    case 'generateTripImage':
    case 'updateTripDetails':
      return [['trips'], ['trip', tripId]];

    default:
      return [];
  }
}
