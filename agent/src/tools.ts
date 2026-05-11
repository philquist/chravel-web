/**
 * Tool Definitions — All 75 concierge tools ported to LiveKit agent format.
 *
 * Single source of truth is _shared/concierge/toolRegistry.ts.
 * This file mirrors those declarations using Zod schemas for the agent framework.
 *
 * Tool execution strategy:
 * - Write tools (createTask, addToCalendar, etc.) → trip_pending_actions buffer
 * - Read tools (getPaymentSummary, searchTripData) → direct Supabase queries
 * - External API tools (searchPlaces, searchWeb, etc.) → call execute-concierge-tool edge fn
 *
 * Rich card data is sent to the frontend via data messages after tool execution.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (args: any, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

export interface ToolContext {
  tripId: string;
  userId: string;
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseServiceKey: string;
  agentAssertion: string;
}

// ── Supabase Client ────────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export function createToolContext(
  tripId: string,
  userId: string,
  agentAssertion: string,
): ToolContext {
  return {
    tripId,
    userId,
    supabase: getSupabase(),
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    agentAssertion,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Execute a tool via the execute-concierge-tool edge function.
 * Used for external API tools (Maps, search, flights, etc.) to reuse
 * existing API key rotation and error handling.
 */
async function callEdgeFunction(
  ctx: ToolContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${ctx.supabaseUrl}/functions/v1/execute-concierge-tool`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.supabaseServiceKey}`,
      'X-Agent-Assertion': ctx.agentAssertion,
    },
    body: JSON.stringify({
      toolName,
      args,
      tripId: ctx.tripId,
      userId: ctx.userId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    console.error(`[agent:tool] Edge function error for ${toolName}:`, res.status, text);
    return { error: `Tool execution failed: ${res.status}`, toolName };
  }

  return (await res.json()) as Record<string, unknown>;
}

/**
 * Insert a pending action for write tools.
 * Write operations go through the trip_pending_actions buffer,
 * not directly to shared state (per CLAUDE.md agent memory #7).
 */
async function insertPendingAction(
  ctx: ToolContext,
  toolName: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const toolCallId =
    typeof payload.idempotency_key === 'string' && payload.idempotency_key.trim().length > 0
      ? payload.idempotency_key.trim()
      : null;

  const { data, error } = await ctx.supabase
    .from('trip_pending_actions')
    .insert({
      trip_id: ctx.tripId,
      user_id: ctx.userId,
      tool_name: toolName,
      tool_call_id: toolCallId,
      payload,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[agent:tool] Pending action insert failed for ${toolName}:`, error.message);
    return { error: error.message, toolName };
  }

  return { success: true, actionId: data.id, toolName, toolCallId };
}

// ── Tool Definitions ───────────────────────────────────────────────────────────
// Grouped by execution strategy: write (pending action), read (direct DB), external (edge fn)

// --- Write Tools (via pending actions buffer) ---

const addToCalendar: ToolDefinition = {
  name: 'addToCalendar',
  description: 'Add an event to the trip calendar',
  schema: z.object({
    idempotency_key: z.string().optional(),
    title: z.string().describe('Event title'),
    datetime: z.string().describe('ISO 8601 datetime string'),
    location: z.string().optional().describe('Event location or address'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'addToCalendar', { ...args, tripId: ctx.tripId }),
};

const createTask: ToolDefinition = {
  name: 'createTask',
  description: 'Create a task for the trip group',
  schema: z.object({
    idempotency_key: z.string().optional(),
    title: z.string().describe('Task title'),
    notes: z.string().optional().describe('Additional notes'),
    assignee: z.string().optional().describe('Person to assign'),
    dueDate: z.string().optional().describe('Due date ISO 8601'),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'createTask', { ...args, tripId: ctx.tripId }),
};

const createPoll: ToolDefinition = {
  name: 'createPoll',
  description: 'Create a poll for the group to vote on',
  schema: z.object({
    idempotency_key: z.string().optional(),
    question: z.string().describe('The poll question'),
    options: z.array(z.string()).describe('List of poll options (2-6)'),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'createPoll', { ...args, tripId: ctx.tripId }),
};

const updateCalendarEvent: ToolDefinition = {
  name: 'updateCalendarEvent',
  description: 'Update an existing trip calendar event',
  schema: z.object({
    idempotency_key: z.string().optional(),
    eventId: z.string().describe('ID of the event to update'),
    title: z.string().optional(),
    datetime: z.string().optional(),
    endDatetime: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'updateCalendarEvent', { ...args, tripId: ctx.tripId }),
};

const deleteCalendarEvent: ToolDefinition = {
  name: 'deleteCalendarEvent',
  description: 'Delete an event from the trip calendar',
  schema: z.object({
    idempotency_key: z.string().optional(),
    eventId: z.string().describe('ID of the event to delete'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'deleteCalendarEvent', { ...args, tripId: ctx.tripId }),
};

const updateTask: ToolDefinition = {
  name: 'updateTask',
  description: 'Update an existing trip task',
  schema: z.object({
    idempotency_key: z.string().optional(),
    taskId: z.string().describe('ID of the task to update'),
    title: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    completed: z.boolean().optional(),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'updateTask', { ...args, tripId: ctx.tripId }),
};

const deleteTask: ToolDefinition = {
  name: 'deleteTask',
  description: 'Delete a task from the trip',
  schema: z.object({
    idempotency_key: z.string().optional(),
    taskId: z.string().describe('ID of the task to delete'),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'deleteTask', { ...args, tripId: ctx.tripId }),
};

const savePlace: ToolDefinition = {
  name: 'savePlace',
  description: 'Save a place or link to the trip Places section',
  schema: z.object({
    idempotency_key: z.string().optional(),
    name: z.string().describe('Name of the place or link'),
    url: z.string().optional().describe('URL for the place'),
    description: z.string().optional().describe('Why this place is recommended'),
    category: z
      .string()
      .optional()
      .describe('attraction, accommodation, activity, appetite, other'),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'savePlace', { ...args, tripId: ctx.tripId }),
};

const setBasecamp: ToolDefinition = {
  name: 'setBasecamp',
  description: 'Set the trip or personal basecamp accommodation',
  schema: z.object({
    idempotency_key: z.string().optional(),
    scope: z.string().describe('"trip" for group or "personal" for user'),
    name: z.string().describe('Hotel/accommodation name'),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'setBasecamp', { ...args, tripId: ctx.tripId, userId: ctx.userId }),
};

const addToAgenda: ToolDefinition = {
  name: 'addToAgenda',
  description: 'Add a session to an event agenda',
  schema: z.object({
    idempotency_key: z.string().optional(),
    eventId: z.string().describe('Parent event ID'),
    title: z.string().describe('Session title'),
    description: z.string().optional(),
    sessionDate: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    location: z.string().optional(),
    speakers: z.array(z.string()).optional(),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'addToAgenda', { ...args, tripId: ctx.tripId }),
};

const createBroadcast: ToolDefinition = {
  name: 'createBroadcast',
  description: 'Send a broadcast to all trip members',
  schema: z.object({
    idempotency_key: z.string().optional(),
    message: z.string().describe('Broadcast message'),
    priority: z.string().optional().describe('"normal" or "urgent"'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'createBroadcast', {
      ...args,
      tripId: ctx.tripId,
      userId: ctx.userId,
    }),
};

const createNotification: ToolDefinition = {
  name: 'createNotification',
  description: 'Send in-app notifications',
  schema: z.object({
    idempotency_key: z.string().optional(),
    title: z.string().describe('Notification title'),
    message: z.string().describe('Notification body'),
    targetUserIds: z.array(z.string()).optional(),
    type: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'createNotification', { ...args, tripId: ctx.tripId }),
};

const settleExpense: ToolDefinition = {
  name: 'settleExpense',
  description: 'Mark a payment split as settled',
  schema: z.object({
    idempotency_key: z.string().optional(),
    splitId: z.string().describe('Payment split ID'),
    amount: z.number().optional(),
    method: z.string().optional().describe('Venmo, Zelle, cash, etc.'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'settleExpense', { ...args, tripId: ctx.tripId }),
};

const emitSmartImportPreview: ToolDefinition = {
  name: 'emitSmartImportPreview',
  description: 'Extract calendar events from docs and show preview card',
  schema: z.object({
    idempotency_key: z.string().optional(),
    events: z.array(
      z.object({
        idempotency_key: z.string().optional(),
        title: z.string(),
        datetime: z.string(),
        endDatetime: z.string().optional(),
        location: z.string().optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }),
    ),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'emitSmartImportPreview', { ...args, tripId: ctx.tripId }),
};

const emitReservationDraft: ToolDefinition = {
  name: 'emitReservationDraft',
  description: 'Create a reservation draft card for booking intents',
  schema: z.object({
    idempotency_key: z.string().optional(),
    placeQuery: z.string().describe('Restaurant/venue name'),
    startTimeISO: z.string().optional(),
    partySize: z.number().optional(),
    reservationName: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'emitReservationDraft', args),
};

const generateTripImage: ToolDefinition = {
  name: 'generateTripImage',
  description: 'Generate a custom AI image for the trip',
  schema: z.object({
    idempotency_key: z.string().optional(),
    prompt: z.string().describe('Image description'),
    style: z.string().optional().describe('photo, illustration, watercolor, minimal, vibrant'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'generateTripImage', args),
};

const setTripHeaderImage: ToolDefinition = {
  name: 'setTripHeaderImage',
  description: 'Set the trip header/cover image',
  schema: z.object({
    idempotency_key: z.string().optional(),
    imageUrl: z.string().describe('URL of the image'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'setTripHeaderImage', { ...args, tripId: ctx.tripId }),
};

// --- Read Tools (direct Supabase queries) ---

const getPaymentSummary: ToolDefinition = {
  name: 'getPaymentSummary',
  description: 'Get a summary of who owes money to whom',
  schema: z.object({
    idempotency_key: z.string().optional(),
  }),
  execute: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from('payment_splits')
      .select(
        '*, payer:profiles_public!payer_id(display_name), payee:profiles_public!payee_id(display_name)',
      )
      .eq('trip_id', ctx.tripId)
      .eq('is_settled', false);

    if (error) return { error: error.message };
    return { splits: data ?? [], count: (data ?? []).length };
  },
};

const searchTripData: ToolDefinition = {
  name: 'searchTripData',
  description: 'Search across all trip data',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Search query'),
    types: z.array(z.string()).optional().describe('calendar, task, poll, link, payment'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchTripData', args),
};

const searchTripArtifacts: ToolDefinition = {
  name: 'searchTripArtifacts',
  description: 'Search uploaded trip documents, screenshots, PDFs',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Semantic search query'),
    artifact_types: z.array(z.string()).optional(),
    limit: z.number().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchTripArtifacts', args),
};

const detectCalendarConflicts: ToolDefinition = {
  name: 'detectCalendarConflicts',
  description: 'Check if a time slot conflicts with existing events',
  schema: z.object({
    idempotency_key: z.string().optional(),
    datetime: z.string().describe('Proposed start time ISO 8601'),
    endDatetime: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'detectCalendarConflicts', args),
};

const verifyArtifact: ToolDefinition = {
  name: 'verify_artifact',
  description: 'Verify a created artifact exists by ID or idempotency key',
  schema: z.object({
    type: z.string().describe('task, event, place, link, poll'),
    id: z.string().optional(),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'verify_artifact', args),
};

const explainPermission: ToolDefinition = {
  name: 'explainPermission',
  description: 'Explain whether an action is allowed and why',
  schema: z.object({
    idempotency_key: z.string().optional(),
    action: z.string().describe('The action to check'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'explainPermission', args),
};

const getDeepLink: ToolDefinition = {
  name: 'getDeepLink',
  description: 'Generate an in-app deep link for a trip entity',
  schema: z.object({
    idempotency_key: z.string().optional(),
    entityType: z.string().describe('event, task, poll, link, payment, broadcast'),
    entityId: z.string().describe('ID of the item'),
  }),
  execute: (_args, ctx) => {
    // Deep links are constructed client-side, but we return the data needed
    return Promise.resolve({
      deepLink: `/trip/${ctx.tripId}/${_args.entityType}/${_args.entityId}`,
      entityType: _args.entityType,
      entityId: _args.entityId,
    });
  },
};

// --- External API Tools (via execute-concierge-tool edge function) ---

const searchPlaces: ToolDefinition = {
  name: 'searchPlaces',
  description: 'Search for nearby places like restaurants, hotels, attractions',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Search query'),
    nearLat: z.number().optional(),
    nearLng: z.number().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchPlaces', args),
};

const getPlaceDetails: ToolDefinition = {
  name: 'getPlaceDetails',
  description: 'Get detailed info about a specific place',
  schema: z.object({
    idempotency_key: z.string().optional(),
    placeId: z.string().describe('Google Places ID'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getPlaceDetails', args),
};

const getDirectionsETA: ToolDefinition = {
  name: 'getDirectionsETA',
  description: 'Get directions, travel time, and distance between two locations',
  schema: z.object({
    idempotency_key: z.string().optional(),
    origin: z.string().describe('Starting address'),
    destination: z.string().describe('Destination address'),
    departureTime: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getDirectionsETA', args),
};

const getTimezone: ToolDefinition = {
  name: 'getTimezone',
  description: 'Get the time zone for a geographic location',
  schema: z.object({
    idempotency_key: z.string().optional(),
    lat: z.number().describe('Latitude'),
    lng: z.number().describe('Longitude'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getTimezone', args),
};

const searchImages: ToolDefinition = {
  name: 'searchImages',
  description: 'Search for images on the web',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Image search query'),
    count: z.number().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchImages', args),
};

const getStaticMapUrl: ToolDefinition = {
  name: 'getStaticMapUrl',
  description: 'Generate a map image showing a location or route',
  schema: z.object({
    idempotency_key: z.string().optional(),
    center: z.string().describe('Address or lat,lng'),
    zoom: z.number().optional(),
    markers: z.array(z.string()).optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getStaticMapUrl', args),
};

const searchWeb: ToolDefinition = {
  name: 'searchWeb',
  description: 'Search the web for real-time information',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Search query'),
    count: z.number().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchWeb', args),
};

const getDistanceMatrix: ToolDefinition = {
  name: 'getDistanceMatrix',
  description: 'Get travel times from multiple origins to multiple destinations',
  schema: z.object({
    idempotency_key: z.string().optional(),
    origins: z.array(z.string()),
    destinations: z.array(z.string()),
    mode: z.string().optional().describe('driving, walking, bicycling, transit'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getDistanceMatrix', args),
};

const validateAddress: ToolDefinition = {
  name: 'validateAddress',
  description: 'Validate and clean up an address',
  schema: z.object({
    idempotency_key: z.string().optional(),
    address: z.string().describe('Address to validate'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'validateAddress', args),
};

const searchFlights: ToolDefinition = {
  name: 'searchFlights',
  description: 'Search flights and return Google Flights deeplinks',
  schema: z.object({
    idempotency_key: z.string().optional(),
    origin: z.string().describe('Origin airport code or city'),
    destination: z.string().describe('Destination airport code or city'),
    departureDate: z.string().describe('YYYY-MM-DD'),
    returnDate: z.string().optional(),
    passengers: z.number().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchFlights', args),
};

const getWeatherForecast: ToolDefinition = {
  name: 'getWeatherForecast',
  description: 'Get weather forecast',
  schema: z.object({
    idempotency_key: z.string().optional(),
    location: z.string().describe('City or location name'),
    date: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getWeatherForecast', args),
};

const convertCurrency: ToolDefinition = {
  name: 'convertCurrency',
  description: 'Convert between currencies with live rates',
  schema: z.object({
    idempotency_key: z.string().optional(),
    amount: z.number().describe('Amount to convert'),
    from: z.string().describe('Source currency code'),
    to: z.string().describe('Target currency code'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'convertCurrency', args),
};

const browseWebsite: ToolDefinition = {
  name: 'browseWebsite',
  description: 'Browse a website to extract travel info',
  schema: z.object({
    idempotency_key: z.string().optional(),
    url: z.string().describe('URL to browse'),
    instruction: z.string().optional().describe('What to look for'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'browseWebsite', args),
};

const makeReservation: ToolDefinition = {
  name: 'makeReservation',
  description: 'Research and prepare a reservation',
  schema: z.object({
    idempotency_key: z.string().optional(),
    venue: z.string().describe('Restaurant/hotel/venue name'),
    datetime: z.string().optional(),
    partySize: z.number().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    specialRequests: z.string().optional(),
    bookingUrl: z.string().optional(),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'makeReservation', args),
};

const searchHotels: ToolDefinition = {
  name: 'searchHotels',
  description:
    'Search for hotels/lodging near a location. Returns up to 5 results with ratings, amenities, and links.',
  schema: z.object({
    idempotency_key: z.string().optional(),
    query: z.string().describe('Search query (e.g. "boutique hotel in Paris")'),
    nearLat: z.number().optional().describe('Latitude to search near'),
    nearLng: z.number().optional().describe('Longitude to search near'),
    checkIn: z.string().optional().describe('Check-in date (YYYY-MM-DD)'),
    checkOut: z.string().optional().describe('Check-out date (YYYY-MM-DD)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchHotels', args),
};

const getHotelDetails: ToolDefinition = {
  name: 'getHotelDetails',
  description:
    'Get detailed information about a specific hotel by its Google Place ID. Returns rating, amenities, photos, and booking links.',
  schema: z.object({
    idempotency_key: z.string().optional(),
    placeId: z.string().describe('Google Place ID of the hotel (from searchHotels results)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getHotelDetails', args),
};

// ── New Tools (60-tool expansion) ────────────────────────────────────────────

const optimizeItinerary: ToolDefinition = {
  name: 'optimizeItinerary',
  description:
    'Suggest an optimal ordering of trip stops or activities to minimize total travel time.',
  schema: z.object({
    locations: z
      .array(z.string())
      .describe('List of addresses or place names to order optimally (2–10 items)'),
    startingPoint: z.string().optional().describe('Starting location such as the hotel address'),
    mode: z
      .string()
      .optional()
      .describe('Transport mode: driving (default), walking, bicycling, transit'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'optimizeItinerary', args),
};

const detectScheduleConflicts: ToolDefinition = {
  name: 'detectScheduleConflicts',
  description: 'Scan the full trip calendar for overlapping events or scheduling issues.',
  schema: z.object({
    date: z
      .string()
      .optional()
      .describe('ISO date (YYYY-MM-DD) to check a specific day. Omit to scan all trip dates.'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'detectScheduleConflicts', args),
};

const generatePackingList: ToolDefinition = {
  name: 'generatePackingList',
  description:
    'Generate a personalized packing list based on destination, trip duration, expected weather, and planned activities.',
  schema: z.object({
    destination: z.string().describe('Destination city or country'),
    startDate: z.string().optional().describe('Trip start date (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('Trip end date (YYYY-MM-DD)'),
    activities: z
      .array(z.string())
      .optional()
      .describe('Planned activity types: beach, hiking, formal dining, skiing, business, etc.'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'generatePackingList', args),
};

const addReminder: ToolDefinition = {
  name: 'addReminder',
  description:
    'Set a time-based reminder for a trip activity, task, or custom message. Delivered as an in-app notification at the specified time.',
  schema: z.object({
    idempotency_key: z.string().optional(),
    message: z.string().describe('Reminder message content'),
    remindAt: z.string().describe('ISO 8601 datetime for when to send the reminder'),
    entityType: z.string().optional().describe('Optional: event, task, or custom'),
    entityId: z.string().optional().describe('Optional: ID of the associated event or task'),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'addReminder', { ...args, tripId: ctx.tripId }),
};

const getVisaRequirements: ToolDefinition = {
  name: 'getVisaRequirements',
  description:
    "Look up visa and entry requirements for a destination country based on the traveler's passport nationality.",
  schema: z.object({
    destination: z.string().describe('Destination country name or code'),
    passportCountry: z
      .string()
      .optional()
      .describe('Passport nationality, e.g. "US", "United Kingdom", "Canada"'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getVisaRequirements', args),
};

const getTravelAdvisories: ToolDefinition = {
  name: 'getTravelAdvisories',
  description:
    'Get current travel safety advisories, warnings, and entry restrictions for a destination country.',
  schema: z.object({
    destination: z.string().describe('Destination country or city'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getTravelAdvisories', args),
};

const getLocalPhrases: ToolDefinition = {
  name: 'getLocalPhrases',
  description:
    'Get common useful phrases in the local language for a destination, with pronunciation tips.',
  schema: z.object({
    destination: z.string().describe('Destination city or country'),
    category: z
      .string()
      .optional()
      .describe(
        'Optional focus: greetings, dining, transport, emergency, shopping, or all (default: all)',
      ),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getLocalPhrases', args),
};

const trackFlightStatus: ToolDefinition = {
  name: 'trackFlightStatus',
  description:
    'Get real-time status for a specific flight number: departure and arrival times, gate, delays, and current flight status.',
  schema: z.object({
    flightNumber: z.string().describe('IATA flight number, e.g. "AA443" or "UA1234"'),
    date: z.string().optional().describe('Flight date (YYYY-MM-DD). Defaults to today.'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'trackFlightStatus', args),
};

const searchCarRentals: ToolDefinition = {
  name: 'searchCarRentals',
  description:
    'Search for car rental options at a destination or airport. Returns links to major rental providers and pricing guidance.',
  schema: z.object({
    location: z.string().describe('Pickup location — city, airport code, or address'),
    pickupDate: z.string().optional().describe('Pickup date (YYYY-MM-DD)'),
    returnDate: z.string().optional().describe('Return date (YYYY-MM-DD)'),
    carType: z.string().optional().describe('Optional: economy, compact, SUV, minivan, luxury'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchCarRentals', args),
};

const searchPublicTransit: ToolDefinition = {
  name: 'searchPublicTransit',
  description: 'Find public transit routes (subway, bus, train, tram) between two locations.',
  schema: z.object({
    origin: z.string().describe('Starting address or location'),
    destination: z.string().describe('Destination address or location'),
    departureTime: z.string().optional().describe('Optional ISO 8601 departure datetime'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchPublicTransit', args),
};

const searchExperiences: ToolDefinition = {
  name: 'searchExperiences',
  description:
    'Search for bookable tours, activities, and experiences near a destination: cooking classes, city tours, adventure activities, cultural workshops.',
  schema: z.object({
    destination: z.string().describe('City or destination to search near'),
    category: z
      .string()
      .optional()
      .describe('Optional: food & drink, outdoor, culture, wellness, adventure, sightseeing'),
    date: z.string().optional().describe('Optional preferred date (YYYY-MM-DD)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchExperiences', args),
};

const getLocalEvents: ToolDefinition = {
  name: 'getLocalEvents',
  description:
    'Find concerts, festivals, sports games, markets, and other events near the trip destination.',
  schema: z.object({
    destination: z.string().describe('City or region to search'),
    startDate: z.string().optional().describe('Start date for event search (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date for event search (YYYY-MM-DD)'),
    category: z
      .string()
      .optional()
      .describe('Optional: music, sports, food, arts, festival, market'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getLocalEvents', args),
};

const findNearby: ToolDefinition = {
  name: 'findNearby',
  description:
    'Find practical nearby amenities: ATMs, pharmacies, hospitals, supermarkets, gas stations, laundromats, or post offices.',
  schema: z.object({
    placeType: z
      .string()
      .describe(
        'Type of place: atm, pharmacy, hospital, supermarket, gas_station, laundry, post_office, bank, police',
      ),
    near: z
      .string()
      .optional()
      .describe(
        'Location to search near: address, place name, or "trip hotel" to use trip basecamp',
      ),
    limit: z.number().optional().describe('Max results to return (default 5, max 10)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'findNearby', args),
};

const setTripBudget: ToolDefinition = {
  name: 'setTripBudget',
  description:
    'Set a budget target for the trip — total or per category — so the group can track spending against a goal.',
  schema: z.object({
    idempotency_key: z.string().optional(),
    totalBudget: z.number().describe("Total trip budget in the group's currency"),
    currency: z.string().optional().describe('Currency code, e.g. USD, EUR, GBP'),
    categoryBudgets: z.record(z.number()).optional().describe('Per-category budgets'),
    notes: z.string().optional().describe('Optional budget notes'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'setTripBudget', { ...args, tripId: ctx.tripId }),
};

const splitTaskAssignments: ToolDefinition = {
  name: 'splitTaskAssignments',
  description:
    'Bulk-create and assign tasks across trip members. Use when the group needs to divide responsibilities.',
  schema: z.object({
    idempotency_key: z.string().optional(),
    tasks: z
      .array(
        z.object({
          title: z.string().describe('Task title'),
          assignee: z
            .string()
            .optional()
            .describe('Member display name or "auto" to distribute evenly'),
          dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
          notes: z.string().optional(),
        }),
      )
      .describe('List of tasks to create with optional assignees'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'splitTaskAssignments', { ...args, tripId: ctx.tripId }),
};

const getTripStats: ToolDefinition = {
  name: 'getTripStats',
  description:
    'Get aggregate statistics for the trip: total spend, cost per day, cost per person, number of activities, and days until departure.',
  schema: z.object({}),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getTripStats', args),
};

const shareItinerary: ToolDefinition = {
  name: 'shareItinerary',
  description:
    'Generate a shareable link to the trip itinerary that can be sent to people outside the app or used for printing.',
  schema: z.object({
    format: z
      .string()
      .optional()
      .describe('Optional: "web" (default shareable link) or "print" (print-friendly view)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'shareItinerary', args),
};

const getEmergencyContacts: ToolDefinition = {
  name: 'getEmergencyContacts',
  description:
    "Get local emergency contact numbers for a destination: police, ambulance, fire brigade, tourist helplines, and the traveler's embassy contact.",
  schema: z.object({
    destination: z.string().describe('Country or city name'),
    passportCountry: z
      .string()
      .optional()
      .describe("Optional: traveler's nationality for relevant embassy contact"),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getEmergencyContacts', args),
};

const emitBulkDeletePreview: ToolDefinition = {
  name: 'emitBulkDeletePreview',
  description:
    'Search for trip calendar events matching criteria and show a deletion preview card for user confirmation. Use when user wants to remove multiple events: "remove all away games", "delete the Houston, Austin, San Antonio dates", "remove all events after March 15", "clear imported games". Shows a preview — NEVER deletes directly. User selects which events to remove.',
  schema: z.object({
    idempotency_key: z.string(),
    titleContains: z
      .string()
      .optional()
      .describe('Search events whose title contains this text (case-insensitive)'),
    locationContains: z
      .string()
      .optional()
      .describe('Search events whose location contains this text'),
    afterDate: z
      .string()
      .optional()
      .describe(
        'Only events starting after this date (ISO 8601). Interpreted as end-of-day in trip timezone (exclusive of the given date).',
      ),
    beforeDate: z
      .string()
      .optional()
      .describe(
        'Only events starting before this date (ISO 8601). Interpreted as start-of-day in trip timezone (exclusive of the given date).',
      ),
    category: z.string().optional().describe('Filter by event category'),
    eventTitles: z
      .array(z.string())
      .optional()
      .describe(
        'Specific event titles to match. Uses exact-first matching: tries exact match, then startsWith, then contains only if no closer matches found.',
      ),
    matchMode: z
      .enum(['exact', 'contains', 'auto'])
      .optional()
      .describe('How to match eventTitles. Default: auto (exact-first, falls back to contains)'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'emitBulkDeletePreview', { ...args, tripId: ctx.tripId }),
};

const bulkDeleteCalendarEvents: ToolDefinition = {
  name: 'bulkDeleteCalendarEvents',
  description:
    'Permanently delete multiple calendar events from a trip. MUST extract the IDs to delete. No undo. Provide clear context to the user about what was deleted.',
  schema: z.object({
    event_ids: z.array(z.string()).describe('The IDs of the calendar events to delete.'),
    idempotency_key: z
      .string()
      .describe('A unique UUID v4 string for this mutation to prevent duplicate executions.'),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'bulkDeleteCalendarEvents', { ...args, tripId: ctx.tripId }),
};

// ── New Tools (74-tool expansion) ─────────────────────────────────────────────

const duplicateCalendarEvent: ToolDefinition = {
  name: 'duplicateCalendarEvent',
  description:
    'Duplicate an existing trip calendar event to a new date. Copies all fields and adjusts the date. Requires user confirmation.',
  schema: z.object({
    eventId: z.string().describe('UUID of the event to duplicate'),
    newDate: z.string().describe('ISO 8601 date (YYYY-MM-DD) for the new occurrence'),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'duplicateCalendarEvent', { ...args, tripId: ctx.tripId }),
};

const bulkMarkTasksDone: ToolDefinition = {
  name: 'bulkMarkTasksDone',
  description:
    'Mark multiple trip tasks as complete. Accepts explicit task IDs or a filter keyword to match by title. Requires user confirmation.',
  schema: z.object({
    taskIds: z.array(z.string()).optional().describe('Explicit list of task UUIDs to mark done'),
    filter: z
      .string()
      .optional()
      .describe('Title keyword to find matching tasks (e.g., "packing")'),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'bulkMarkTasksDone', { ...args, tripId: ctx.tripId }),
};

const cloneActivity: ToolDefinition = {
  name: 'cloneActivity',
  description:
    'Clone an existing trip calendar event to one or more new dates, preserving duration and details. Requires user confirmation.',
  schema: z.object({
    eventId: z.string().describe('UUID of the source event to clone'),
    targetDates: z
      .array(z.string())
      .describe('ISO 8601 date strings (YYYY-MM-DD) to clone the event onto'),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'cloneActivity', { ...args, tripId: ctx.tripId }),
};

const addExpense: ToolDefinition = {
  name: 'addExpense',
  description:
    'Log a new shared expense to the trip. Supports optional split across participants. Requires user confirmation.',
  schema: z.object({
    description: z.string().describe('What the expense is for (e.g., "Airport taxi")'),
    amount: z.number().positive().describe('Expense amount'),
    currency: z.string().optional().describe('Currency code, e.g. "USD". Defaults to USD.'),
    splitParticipants: z
      .array(z.string())
      .optional()
      .describe('Optional user display names or IDs to split with'),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) => insertPendingAction(ctx, 'addExpense', { ...args, tripId: ctx.tripId }),
};

const moveCalendarEvent: ToolDefinition = {
  name: 'moveCalendarEvent',
  description:
    'Move an existing trip calendar event to a new date and optionally a new time. Preserves event duration.',
  schema: z.object({
    eventId: z.string().describe('UUID of the event to move'),
    newDate: z.string().describe('ISO 8601 date (YYYY-MM-DD)'),
    newTime: z
      .string()
      .optional()
      .describe('New start time HH:MM (24h); keeps original time if omitted'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'moveCalendarEvent', args),
};

const closePoll: ToolDefinition = {
  name: 'closePoll',
  description: 'Close an active trip poll so no further votes can be cast. Returns final results.',
  schema: z.object({
    pollId: z.string().describe('UUID of the poll to close'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'closePoll', args),
};

const getRecentActivity: ToolDefinition = {
  name: 'getRecentActivity',
  description:
    "Get a chronological summary of recent changes to the trip. Use when user asks 'what's new', 'what changed', or 'catch me up'.",
  schema: z.object({
    days: z.number().optional().describe('How many days back to look (default: 7)'),
    limit: z.number().optional().describe('Max activity items to return (default: 20)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getRecentActivity', args),
};

const getTaskSummary: ToolDefinition = {
  name: 'getTaskSummary',
  description:
    'Get a summary of trip tasks grouped by status (todo/done/overdue), optionally filtered by assignee.',
  schema: z.object({
    assignee: z.string().optional().describe('Filter by assignee display name or user ID'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getTaskSummary', args),
};

const getGroupAvailability: ToolDefinition = {
  name: 'getGroupAvailability',
  description:
    'Find free time windows in the trip calendar — slots where no events are scheduled. Uses shared trip calendar only.',
  schema: z.object({
    date: z.string().describe('ISO 8601 date (YYYY-MM-DD) to check availability for'),
    dayCount: z.number().optional().describe('Number of consecutive days to check (default: 1)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getGroupAvailability', args),
};

const getUpcomingReminders: ToolDefinition = {
  name: 'getUpcomingReminders',
  description: 'List upcoming reminders set for this trip via the AI concierge.',
  schema: z.object({
    limit: z.number().optional().describe('Max reminders to return (default: 10)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getUpcomingReminders', args),
};

const searchTripChats: ToolDefinition = {
  name: 'searchTripChats',
  description: 'Search trip chat messages for a keyword or phrase.',
  schema: z.object({
    query: z.string().describe('Text to search for in chat messages'),
    limit: z.number().optional().describe('Max results (default: 20)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'searchTripChats', args),
};

const getPollResults: ToolDefinition = {
  name: 'getPollResults',
  description: 'Get current results and vote counts for one or all active polls in the trip.',
  schema: z.object({
    pollId: z
      .string()
      .optional()
      .describe('UUID of a specific poll. Omit to return all active polls.'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getPollResults', args),
};

const getTripLinks: ToolDefinition = {
  name: 'getTripLinks',
  description: 'Get saved links and places for this trip (the Explore/Places section).',
  schema: z.object({
    category: z
      .string()
      .optional()
      .describe('Filter by category (e.g., "restaurant", "hotel", "activity")'),
    limit: z.number().optional().describe('Max results (default: 30)'),
  }),
  execute: (args, ctx) => callEdgeFunction(ctx, 'getTripLinks', args),
};

const getTripInfo: ToolDefinition = {
  name: 'getTripInfo',
  description:
    'Get basic details about this trip: name, destination, start/end dates, description, type, timezone.',
  schema: z.object({}),
  execute: (_args, ctx) => callEdgeFunction(ctx, 'getTripInfo', {}),
};

const updateTripDetails: ToolDefinition = {
  name: 'updateTripDetails',
  description:
    'Update core trip details: name, destination, description, start date, or end date. Requires user confirmation.',
  schema: z.object({
    name: z.string().optional().describe('New trip name'),
    destination: z.string().optional().describe('New destination (city, country)'),
    description: z.string().optional().describe('New trip description'),
    startDate: z.string().optional().describe('New start date (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('New end date (YYYY-MM-DD)'),
    idempotency_key: z.string().optional(),
  }),
  execute: (args, ctx) =>
    insertPendingAction(ctx, 'updateTripDetails', { ...args, tripId: ctx.tripId }),
};

// ── Export All Tools ───────────────────────────────────────────────────────────

export const ALL_TOOLS: ToolDefinition[] = [
  // Write tools
  addToCalendar,
  createTask,
  createPoll,
  updateCalendarEvent,
  deleteCalendarEvent,
  updateTask,
  deleteTask,
  savePlace,
  setBasecamp,
  addToAgenda,
  createBroadcast,
  createNotification,
  settleExpense,
  emitSmartImportPreview,
  emitReservationDraft,
  generateTripImage,
  setTripHeaderImage,
  // Read tools
  getPaymentSummary,
  searchTripData,
  searchTripArtifacts,
  detectCalendarConflicts,
  verifyArtifact,
  explainPermission,
  getDeepLink,
  // External API tools
  searchPlaces,
  getPlaceDetails,
  getDirectionsETA,
  getTimezone,
  searchImages,
  getStaticMapUrl,
  searchWeb,
  getDistanceMatrix,
  validateAddress,
  searchFlights,
  getWeatherForecast,
  convertCurrency,
  browseWebsite,
  makeReservation,
  searchHotels,
  getHotelDetails,
  emitBulkDeletePreview,
  bulkDeleteCalendarEvents,
  // New tools (60-tool expansion)
  optimizeItinerary,
  detectScheduleConflicts,
  generatePackingList,
  addReminder,
  getVisaRequirements,
  getTravelAdvisories,
  getLocalPhrases,
  trackFlightStatus,
  searchCarRentals,
  searchPublicTransit,
  searchExperiences,
  getLocalEvents,
  findNearby,
  setTripBudget,
  splitTaskAssignments,
  getTripStats,
  shareItinerary,
  getEmergencyContacts,
  // New tools (74-tool expansion)
  duplicateCalendarEvent,
  bulkMarkTasksDone,
  cloneActivity,
  addExpense,
  moveCalendarEvent,
  closePoll,
  getRecentActivity,
  getTaskSummary,
  getGroupAvailability,
  getUpcomingReminders,
  searchTripChats,
  getPollResults,
  getTripLinks,
  getTripInfo,
  // Tool #75
  updateTripDetails,
];
