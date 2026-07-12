export interface PendingActionEnvelope {
  pending: true;
  pendingActionId: string;
  actionType: string;
  message: string;
}

export interface PromotedActionEnvelope {
  pending: false;
  promoted: true;
  pendingActionId: string;
  actionType: string;
  message: string;
}

const PENDING_ACTION_TYPES = new Set([
  'add_to_calendar',
  'create_task',
  'create_poll',
  'save_place',
  'create_broadcast',
  'create_notification',
  'add_expense',
  'duplicate_calendar_event',
  'clone_activity',
  'bulk_mark_tasks_done',
  'update_trip_details',
  'add_reminder',
  'set_trip_budget',
  'add_to_agenda',
  'set_basecamp',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Treats the shared pending-buffer contract as a first-class result type so the
 * UI can distinguish "prepared" from "executed".
 */
export function isPendingActionEnvelope(value: unknown): value is PendingActionEnvelope {
  if (!isRecord(value)) return false;
  return (
    value.pending === true &&
    typeof value.pendingActionId === 'string' &&
    value.pendingActionId.length > 0 &&
    typeof value.actionType === 'string' &&
    PENDING_ACTION_TYPES.has(value.actionType) &&
    typeof value.message === 'string'
  );
}

/**
 * Promoted envelope: the server-side fast-path already wrote the row to the real
 * table (trip_events / trip_tasks / trip_polls) AND marked the pending row confirmed.
 * The UI no longer needs to round-trip through the client auto-confirm path.
 */
export function isPromotedActionEnvelope(value: unknown): value is PromotedActionEnvelope {
  if (!isRecord(value)) return false;
  return (
    value.pending === false &&
    value.promoted === true &&
    typeof value.pendingActionId === 'string' &&
    value.pendingActionId.length > 0 &&
    typeof value.actionType === 'string' &&
    PENDING_ACTION_TYPES.has(value.actionType) &&
    typeof value.message === 'string'
  );
}

/**
 * Defensive validation on tool results before they are fed back into the model
 * or surfaced to the user. This prevents malformed/hallucinated tool payloads
 * from masquerading as successful writes.
 */
export function normalizeToolResult(toolName: string, result: unknown): Record<string, unknown> {
  if (!isRecord(result)) {
    return { success: false, error: `Tool "${toolName}" returned an invalid result payload` };
  }

  if (typeof result.error === 'string' && result.error.trim().length > 0) {
    return { success: false, error: result.error.trim() };
  }

  if (isPendingActionEnvelope(result)) {
    return {
      success: true,
      pending: true,
      pendingActionId: result.pendingActionId,
      actionType: result.actionType,
      message: result.message,
    };
  }

  if (isPromotedActionEnvelope(result)) {
    return {
      success: true,
      pending: false,
      promoted: true,
      pendingActionId: result.pendingActionId,
      actionType: result.actionType,
      message: result.message,
    };
  }

  if (toolName === 'createTask' || toolName === 'createPoll' || toolName === 'addToCalendar') {
    return {
      success: false,
      error: `Tool "${toolName}" must return a pending action envelope or promoted action envelope before execution`,
    };
  }

  if (typeof result.success === 'boolean') {
    return result;
  }

  // Read tools often return rich payloads with no explicit success boolean.
  return { success: true, ...result };
}
