import { withCircuitBreaker } from './circuitBreaker.ts';
import { normalizeGeminiModel } from './gemini.ts';
import { assertAiToolPermission } from './tripPermissionGuard.ts';

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
const GOOGLE_CUSTOM_SEARCH_CX = Deno.env.get('GOOGLE_CUSTOM_SEARCH_CX');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

// Resolve the Supabase functions base URL for building proxy URLs.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_FUNCTIONS_BASE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '/functions/v1';

function buildPlacePhotoProxyUrl(
  placePhotoName: string,
  maxWidthPx: number,
  maxHeightPx: number,
): string {
  const params = new URLSearchParams();
  params.set('placePhotoName', placePhotoName);
  params.set('maxWidthPx', String(maxWidthPx));
  params.set('maxHeightPx', String(maxHeightPx));
  return `${SUPABASE_FUNCTIONS_BASE_URL}/image-proxy?${params.toString()}`;
}

export interface LocationContext {
  lat?: number;
  lng?: number;
}

/**
 * Server-side fast-path helper: marks a pending action `confirmed` after a
 * successful real-table write. Safe no-op if the update fails — the row stays
 * pending and the client safety net (usePendingActions) will retry.
 */
async function markPendingConfirmed(
  supabase: any,
  pendingId: string,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from('trip_pending_actions')
      .update({
        status: 'confirmed',
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq('id', pendingId)
      .eq('status', 'pending');
  } catch (err) {
    console.warn('[Tool] markPendingConfirmed failed (non-fatal):', err);
  }
}

export async function executeFunctionCall(
  supabase: any,
  functionName: string,
  args: any,
  tripId: string,
  userId?: string,
  locationContext?: LocationContext | null,
): Promise<any> {
  const startMs = performance.now();
  let result: any;
  try {
    result = await _executeImpl(supabase, functionName, args, tripId, userId, locationContext);
    const elapsed = Math.round(performance.now() - startMs);
    const ok = !result?.error;
    console.log(
      `[Tool] ${functionName} | ${elapsed}ms | ${ok ? 'success' : 'error: ' + (result?.error ?? 'unknown')}`,
    );
    return result;
  } catch (err) {
    const elapsed = Math.round(performance.now() - startMs);
    console.error(
      `[Tool] ${functionName} | ${elapsed}ms | exception: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

async function _executeImpl(
  supabase: any,
  functionName: string,
  args: any,
  tripId: string,
  userId?: string,
  locationContext?: LocationContext | null,
): Promise<any> {
  try {
    await assertAiToolPermission(supabase, userId, tripId, functionName);
  } catch (permErr) {
    const message = permErr instanceof Error ? permErr.message : 'PERMISSION_DENIED';
    return { error: message };
  }

  switch (functionName) {
    case 'addToCalendar': {
      const { title, datetime, endDatetime, location, notes } = args;
      const normalizedTitle = String(title || '').trim();
      if (!normalizedTitle) return { error: 'Event title is required' };

      const parsedStart = new Date(datetime);
      if (Number.isNaN(parsedStart.getTime())) {
        return { error: 'Invalid datetime. Please provide a valid date/time.' };
      }

      const parsedEnd = endDatetime ? new Date(endDatetime) : null;
      if (parsedEnd && Number.isNaN(parsedEnd.getTime())) {
        return { error: 'Invalid endDatetime. Please provide a valid end date/time.' };
      }

      const startTime = parsedStart.toISOString();
      const endTime = parsedEnd
        ? parsedEnd.toISOString()
        : new Date(parsedStart.getTime() + 60 * 60 * 1000).toISOString();

      // B4: Pending buffer (preserves UI contract + audit trail)
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'addToCalendar',
          payload: {
            title: normalizedTitle,
            start_time: startTime,
            end_time: endTime,
            location: location || null,
            description: notes || null,
            created_by: userId || null,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();

      if (pendingError) throw pendingError;

      // ⚡ Fast-path: when the caller is the authenticated trip member, write to the real
      // table immediately so Calendar shows the event without waiting for the client
      // auto-confirm round-trip. RLS still applies — the user's JWT is on `supabase`.
      let promoted = false;
      if (userId) {
        const { error: realInsertError } = await supabase.from('trip_events').insert({
          trip_id: tripId,
          created_by: userId,
          title,
          start_time: startTime,
          end_time: endTime,
          location: location || null,
          description: notes || null,
          source_type: 'ai_concierge',
        });
        if (!realInsertError) {
          promoted = true;
          await supabase
            .from('trip_pending_actions')
            .update({
              status: 'confirmed',
              resolved_at: new Date().toISOString(),
              resolved_by: userId,
            })
            .eq('id', pending.id)
            .eq('status', 'pending');
        } else {
          console.warn(
            '[Tool] addToCalendar fast-path failed, falling back to client confirm:',
            realInsertError.message,
          );
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'add_to_calendar',
        message: promoted
          ? `Added "${normalizedTitle}" to the calendar.`
          : `I'd like to add "${normalizedTitle}" to the calendar. Please confirm in the trip chat.`,
      };
    }

    case 'createTask': {
      const { title, notes, dueDate, assignee, idempotency_key, tool_call_id } = args;
      const taskTitle = String(title || '').trim();
      if (!taskTitle) return { error: 'Task title is required' };

      // Dedupe key: voice passes tool_call_id directly, text passes idempotency_key.
      // Maps to UNIQUE index on (trip_id, tool_call_id) in trip_pending_actions.
      const dedupeId = tool_call_id || idempotency_key || null;

      // B4: Pending buffer (preserves UI contract + audit trail)
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'createTask',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            title: taskTitle,
            description: notes || null,
            creator_id: userId || '',
            due_at: dueDate || null,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();

      if (pendingError) throw pendingError;

      // ⚡ Fast-path: write to trip_tasks immediately + mirror task_status/task_assignments
      // so the new task appears in the Tasks tab without the client auto-confirm round-trip.
      let promoted = false;
      if (userId) {
        const { data: taskRow, error: realInsertError } = await supabase
          .from('trip_tasks')
          .insert({
            trip_id: tripId,
            creator_id: userId,
            title: taskTitle,
            description: notes || null,
            due_at: dueDate || null,
            source_type: 'ai_concierge',
          })
          .select('id')
          .single();

        if (!realInsertError && taskRow?.id) {
          // Mirror manual task creation: assign creator and seed incomplete status
          await supabase
            .from('task_assignments')
            .insert([{ task_id: taskRow.id, user_id: userId }]);
          await supabase
            .from('task_status')
            .insert([{ task_id: taskRow.id, user_id: userId, completed: false }]);
          promoted = true;
          await supabase
            .from('trip_pending_actions')
            .update({
              status: 'confirmed',
              resolved_at: new Date().toISOString(),
              resolved_by: userId,
            })
            .eq('id', pending.id)
            .eq('status', 'pending');
        } else if (realInsertError) {
          console.warn(
            '[Tool] createTask fast-path failed, falling back to client confirm:',
            realInsertError.message,
          );
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'create_task',
        message: promoted
          ? `Created task: "${taskTitle}"${assignee ? ` for ${assignee}` : ''}.`
          : `I'd like to create a task: "${taskTitle}"${assignee ? ` for ${assignee}` : ''}. Please confirm in the trip chat.`,
      };
    }

    case 'createPoll': {
      const { question, options } = args;
      const pollOptions = options.map((opt: string, i: number) => ({
        id: `opt_${i}`,
        text: opt,
        votes: 0,
        voters: [],
      }));

      // B4: Pending buffer (preserves UI contract + audit trail)
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'createPoll',
          payload: {
            question,
            options: pollOptions,
            created_by: userId || null,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();

      if (pendingError) throw pendingError;

      // ⚡ Fast-path: write to trip_polls immediately so the poll appears in the Polls tab.
      let promoted = false;
      if (userId) {
        const { error: realInsertError } = await supabase.from('trip_polls').insert({
          trip_id: tripId,
          created_by: userId,
          question,
          options: pollOptions,
          status: 'active',
          source_type: 'ai_concierge',
        });
        if (!realInsertError) {
          promoted = true;
          await supabase
            .from('trip_pending_actions')
            .update({
              status: 'confirmed',
              resolved_at: new Date().toISOString(),
              resolved_by: userId,
            })
            .eq('id', pending.id)
            .eq('status', 'pending');
        } else {
          console.warn(
            '[Tool] createPoll fast-path failed, falling back to client confirm:',
            realInsertError.message,
          );
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'create_poll',
        message: promoted
          ? `Created poll: "${question}" with ${options.length} options.`
          : `I'd like to create a poll: "${question}" with ${options.length} options. Please confirm in the trip chat.`,
      };
    }

    case 'getPaymentSummary': {
      const { data: payments, error } = await supabase
        .from('trip_payment_messages')
        .select('id, amount, currency, description, created_by, split_count, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;

      const paymentIds = (payments || []).map((p: any) => p.id);
      let splits: any[] = [];
      if (paymentIds.length > 0) {
        const { data: splitData } = await supabase
          .from('payment_splits')
          .select('payment_message_id, debtor_user_id, amount_owed, is_settled')
          .in('payment_message_id', paymentIds);
        splits = splitData || [];
      }

      const totalSpent = (payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const unsettledSplits = splits.filter((s: any) => !s.is_settled);
      const totalOwed = unsettledSplits.reduce(
        (sum: number, s: any) => sum + (s.amount_owed || 0),
        0,
      );

      return {
        success: true,
        totalPayments: payments?.length || 0,
        totalSpent,
        totalOwed,
        unsettledCount: unsettledSplits.length,
        recentPayments: (payments || []).slice(0, 5).map((p: any) => ({
          description: p.description,
          amount: p.amount,
          currency: p.currency,
        })),
      };
    }

    case 'searchPlaces': {
      const { query, nearLat, nearLng } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      const parsedLat = Number(nearLat);
      const parsedLng = Number(nearLng);
      const lat = Number.isFinite(parsedLat) ? parsedLat : locationContext?.lat || null;
      const lng = Number.isFinite(parsedLng) ? parsedLng : locationContext?.lng || null;

      // New Google Places API (Places Text Search)
      const url = `https://places.googleapis.com/v1/places:searchText`;
      const placesResponse = await withCircuitBreaker('google-maps', () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.photos',
          },
          body: JSON.stringify({
            textQuery: query,
            locationBias:
              lat !== null && lng !== null
                ? {
                    circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
                  }
                : undefined,
            maxResultCount: 3,
          }),
          signal: AbortSignal.timeout(8_000),
        }),
      );

      if (!placesResponse.ok) {
        const errorText = await placesResponse.text().catch(() => 'Unknown error');
        console.error(`[Tool] searchPlaces failed (${placesResponse.status}): ${errorText}`);
        return { error: 'Places search failed', status: placesResponse.status };
      }

      const placesData = await placesResponse.json();
      return {
        success: true,
        places: (placesData.places || []).map((p: any) => ({
          placeId: p.id || null,
          name: p.displayName?.text || 'Unknown',
          address: p.formattedAddress || '',
          rating: p.rating || null,
          userRatingCount: p.userRatingCount || null,
          priceLevel: p.priceLevel || null,
          mapsUrl: p.googleMapsUri || null,
          photoCount: p.photos?.length || 0,
          previewPhotoUrl: p.photos?.[0]?.name
            ? buildPlacePhotoProxyUrl(p.photos[0].name, 600, 400)
            : null,
        })),
      };
    }

    case 'searchHotels': {
      const { query, location, checkIn, checkOut } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      // Google Places (New) returns a COARSE, local-market-relative price tier enum —
      // not a nightly rate. We surface it so the model can disclose the tier and honor
      // the HARD BUDGET CONSTRAINT, and (opt-in) filter by it. It is NOT dollar-accurate.
      const PRICE_LEVEL_ORDER = [
        'PRICE_LEVEL_FREE',
        'PRICE_LEVEL_INEXPENSIVE',
        'PRICE_LEVEL_MODERATE',
        'PRICE_LEVEL_EXPENSIVE',
        'PRICE_LEVEL_VERY_EXPENSIVE',
      ];
      const priceLevelToTier = (level: string | null | undefined): number | null => {
        const idx = level ? PRICE_LEVEL_ORDER.indexOf(level) : -1;
        return idx >= 0 ? idx : null;
      };
      // Optional coarse budget ceiling (1=$ … 4=$$$$). When the model supplies it from
      // the user's budget, constrain the search server-side (and drop over-tier results
      // post-fetch). Results with no price tier are KEPT — Google omits it for many
      // lodgings, and dropping them would hide valid in-budget options.
      const maxTier =
        args.maxPriceLevel != null && Number.isFinite(Number(args.maxPriceLevel))
          ? Math.min(4, Math.max(1, Math.round(Number(args.maxPriceLevel))))
          : null;
      const allowedPriceLevels =
        maxTier != null ? PRICE_LEVEL_ORDER.slice(0, maxTier + 1) : undefined;

      // Enrich query to target lodging
      const hotelQuery =
        query && String(query).toLowerCase().includes('hotel')
          ? String(query)
          : `${query || ''} hotels`.trim();

      // Use same Google Places Text Search API as searchPlaces
      const url = 'https://places.googleapis.com/v1/places:searchText';

      // Parse location coordinates
      const lat = Number(args.nearLat);
      const lng = Number(args.nearLng);
      const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
      const fallbackLat = locationContext?.lat;
      const fallbackLng = locationContext?.lng;
      const finalLat = hasLocation ? lat : fallbackLat;
      const finalLng = hasLocation ? lng : fallbackLng;

      const placesResponse = await withCircuitBreaker('google-maps', () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.photos,places.types,places.websiteUri',
          },
          body: JSON.stringify({
            textQuery: hotelQuery,
            includedType: 'lodging',
            locationBias:
              finalLat != null && finalLng != null
                ? { circle: { center: { latitude: finalLat, longitude: finalLng }, radius: 10000 } }
                : undefined,
            maxResultCount: 5,
            // Server-side coarse budget filter (only when a ceiling was supplied).
            ...(allowedPriceLevels ? { priceLevels: allowedPriceLevels } : {}),
          }),
          signal: AbortSignal.timeout(8_000),
        }),
      );

      if (!placesResponse.ok) {
        const errorText = await placesResponse.text().catch(() => 'Unknown error');
        console.error(`[Tool] searchHotels failed (${placesResponse.status}): ${errorText}`);
        return { error: 'Hotel search failed', status: placesResponse.status };
      }

      const placesData = await placesResponse.json();
      const hotels = (placesData.places || [])
        .map((p: any) => {
          // Extract amenities from place types
          const amenityMap: Record<string, string> = {
            swimming_pool: 'Pool',
            fitness_center: 'Fitness',
            spa: 'Spa',
            restaurant: 'Restaurant',
            bar: 'Bar',
            parking: 'Parking',
            free_parking: 'Free Parking',
            wifi: 'WiFi',
          };
          const amenities = (p.types || [])
            .filter((t: string) => amenityMap[t])
            .map((t: string) => amenityMap[t])
            .slice(0, 4);

          // Coarse price tier (0-4) + $-symbol label. Google returns no nightly rate.
          const priceTier = priceLevelToTier(p.priceLevel);
          const priceLabel = priceTier && priceTier > 0 ? '$'.repeat(priceTier) : null;

          return {
            id: p.id || null,
            provider: 'Google Maps',
            title: p.displayName?.text || 'Unknown Hotel',
            subtitle: p.formattedAddress || null,
            badges: amenities.length > 0 ? amenities : undefined,
            price: null, // Google Places returns no nightly rate — only the coarse tier below.
            dates:
              checkIn || checkOut
                ? { check_in: checkIn || null, check_out: checkOut || null }
                : null,
            location: {
              city: null,
              region: null,
              country: null,
            },
            details: {
              rating: p.rating || null,
              reviews_count: p.userRatingCount || null,
              refundable: null,
              amenities,
              // Coarse, local-market-relative price tier ($ = inexpensive … $$$$ = very
              // expensive). Disclose this next to the recommendation to honor the budget.
              price_tier: priceTier,
              price_label: priceLabel,
            },
            deep_links: {
              primary: p.googleMapsUri || null,
              secondary: p.websiteUri || null,
            },
          };
        })
        // Post-fetch safety net for the coarse budget ceiling. Keep hotels with an
        // unknown tier (null) — Google omits it for many lodgings.
        .filter(
          (h: any) =>
            maxTier == null || h.details.price_tier == null || h.details.price_tier <= maxTier,
        );

      return { success: true, hotels, budgetTierCeiling: maxTier };
    }

    case 'getHotelDetails': {
      const { placeId } = args;
      if (!placeId || typeof placeId !== 'string') {
        return { error: 'placeId is required' };
      }
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      const url = `https://places.googleapis.com/v1/places/${placeId}`;
      const detailsResponse = await withCircuitBreaker('google-maps', () =>
        fetch(url, {
          headers: {
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask':
              'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,websiteUri,photos,types,priceLevel,editorialSummary',
          },
          signal: AbortSignal.timeout(8_000),
        }),
      );

      if (!detailsResponse.ok) {
        const errorText = await detailsResponse.text().catch(() => 'Unknown error');
        console.error(`[Tool] getHotelDetails failed (${detailsResponse.status}): ${errorText}`);
        return { error: 'Hotel details fetch failed', status: detailsResponse.status };
      }

      const p = await detailsResponse.json();
      const amenityMap: Record<string, string> = {
        swimming_pool: 'Pool',
        fitness_center: 'Fitness',
        spa: 'Spa',
        restaurant: 'Restaurant',
        bar: 'Bar',
        parking: 'Parking',
        free_parking: 'Free Parking',
        wifi: 'WiFi',
      };
      const amenities = (p.types || [])
        .filter((t: string) => amenityMap[t])
        .map((t: string) => amenityMap[t])
        .slice(0, 6);

      return {
        success: true,
        id: p.id || null,
        provider: 'Google Maps',
        title: p.displayName?.text || 'Unknown Hotel',
        subtitle: p.editorialSummary?.text || p.formattedAddress || null,
        badges: amenities.length > 0 ? amenities : undefined,
        price: null,
        dates: null,
        location: { city: null, region: null, country: null },
        details: {
          rating: p.rating || null,
          reviews_count: p.userRatingCount || null,
          refundable: null,
          amenities,
        },
        deep_links: {
          primary: p.googleMapsUri || null,
          secondary: p.websiteUri || null,
        },
      };
    }

    // ========== NEW TOOLS ==========

    case 'getDirectionsETA': {
      const { origin, destination, departureTime } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
      const body: any = {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      };
      if (departureTime) {
        body.departureTime = new Date(departureTime).toISOString();
      }

      const routesResponse = await withCircuitBreaker('google-maps', () =>
        fetch(routesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.description',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        }),
      );

      if (!routesResponse.ok) {
        const errBody = await routesResponse.text();
        return { error: `Routes API failed (${routesResponse.status})`, details: errBody };
      }

      const routesData = await routesResponse.json();
      const route = routesData.routes?.[0];
      if (!route) {
        return { error: 'No route found between origin and destination' };
      }

      const durationSeconds = parseInt(route.duration?.replace('s', '') || '0', 10);
      const distanceMeters = route.distanceMeters || 0;

      const mapsDeepLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

      return {
        success: true,
        durationMinutes: Math.round(durationSeconds / 60),
        distanceKm: Math.round(distanceMeters / 100) / 10,
        distanceMiles: Math.round((distanceMeters / 1609.34) * 10) / 10,
        summary: route.description || `${Math.round(durationSeconds / 60)} min drive`,
        origin,
        destination,
        mapsUrl: mapsDeepLink,
      };
    }

    case 'getTimezone': {
      const { lat, lng } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const tzUrl = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${GOOGLE_MAPS_API_KEY}`;

      const tzResponse = await withCircuitBreaker('google-maps', () =>
        fetch(tzUrl, { signal: AbortSignal.timeout(8_000) }),
      );
      if (!tzResponse.ok) {
        return { error: `Time Zone API failed (${tzResponse.status})` };
      }

      const tzData = await tzResponse.json();
      if (tzData.status !== 'OK') {
        return {
          error: `Time Zone API error: ${tzData.status}`,
          errorMessage: tzData.errorMessage,
        };
      }

      return {
        success: true,
        timeZoneId: tzData.timeZoneId,
        timeZoneName: tzData.timeZoneName,
        utcOffsetMinutes: (tzData.rawOffset + tzData.dstOffset) / 60,
        rawOffsetMinutes: tzData.rawOffset / 60,
        dstOffsetMinutes: tzData.dstOffset / 60,
      };
    }

    case 'getPlaceDetails': {
      const { placeId } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }

      // New Google Places API (Place Details)
      const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;
      const detailsResponse = await withCircuitBreaker('google-maps', () =>
        fetch(detailsUrl, {
          headers: {
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask':
              'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,priceLevel,currentOpeningHours,editorialSummary,photos',
          },
          signal: AbortSignal.timeout(8_000),
        }),
      );

      if (!detailsResponse.ok) {
        const errorText = await detailsResponse.text().catch(() => 'Unknown error');
        console.error(`[Tool] getPlaceDetails failed (${detailsResponse.status}): ${errorText}`);
        return { error: `Place Details failed (${detailsResponse.status})` };
      }

      const pd = await detailsResponse.json();

      // Build photo URLs (first 5)
      const photoUrls = (pd.photos || [])
        .slice(0, 5)
        .map((photo: any) => (photo.name ? buildPlacePhotoProxyUrl(photo.name, 600, 400) : null))
        .filter(Boolean);

      return {
        success: true,
        placeId: pd.id,
        name: pd.displayName?.text || 'Unknown',
        address: pd.formattedAddress || '',
        phone: pd.internationalPhoneNumber || null,
        website: pd.websiteUri || null,
        mapsUrl: pd.googleMapsUri || null,
        rating: pd.rating || null,
        userRatingCount: pd.userRatingCount || null,
        priceLevel: pd.priceLevel || null,
        hours: pd.currentOpeningHours?.weekdayDescriptions || null,
        editorialSummary: pd.editorialSummary?.text || null,
        photoUrls,
      };
    }

    case 'searchImages': {
      const { query, count } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google Maps API key not configured' };
      }
      if (!GOOGLE_CUSTOM_SEARCH_CX) {
        return {
          error: 'Image search not configured. GOOGLE_CUSTOM_SEARCH_CX secret is missing.',
          suggestion:
            'Try asking me to "search for [place name]" instead — I can show place photos from Google Maps.',
        };
      }

      const num = Math.min(count || 5, 10);
      const csUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&num=${num}&cx=${GOOGLE_CUSTOM_SEARCH_CX}&key=${GOOGLE_MAPS_API_KEY}`;

      const csResponse = await withCircuitBreaker('google-search', () =>
        fetch(csUrl, { signal: AbortSignal.timeout(8_000) }),
      );
      if (!csResponse.ok) {
        return { error: `Custom Search failed (${csResponse.status})` };
      }

      const csData = await csResponse.json();
      return {
        success: true,
        images: (csData.items || []).map((item: any) => ({
          title: item.title || '',
          thumbnailUrl: item.image?.thumbnailLink || '',
          imageUrl: item.link || '',
          sourceDomain: item.displayLink || '',
        })),
        results: (csData.items || []).map((item: any) => ({
          title: item.title || '',
          url: item.link || '',
          snippet: item.title || '',
        })),
      };
    }

    case 'getStaticMapUrl': {
      // Returns an image-proxy URL for a Google Maps Static API image.
      // The API key stays server-side inside the image-proxy edge function.
      const { center, zoom, markers, path, width, height } = args;

      if (!center) {
        return { error: 'center parameter is required (address or "lat,lng")' };
      }

      const w = Math.min(Number(width) || 600, 640);
      const h = Math.min(Number(height) || 400, 640);
      const z = zoom ? Math.min(Number(zoom), 20) : 13;

      const params = new URLSearchParams();
      params.set('center', String(center));
      params.set('zoom', String(z));
      params.set('w', String(w));
      params.set('h', String(h));

      const markerList: string[] = Array.isArray(markers)
        ? (markers as string[]).map(String)
        : markers
          ? [String(markers)]
          : [];
      for (const marker of markerList) {
        params.append('markers', marker);
      }
      if (path) {
        params.set('path', String(path));
      }

      // image-proxy staticmap mode: no API key exposed to client
      const imageUrl = `${SUPABASE_FUNCTIONS_BASE_URL}/image-proxy?${params.toString()}`;

      return {
        success: true,
        imageUrl,
        center: String(center),
      };
    }

    case 'searchWeb': {
      // Real-time web search using Google Custom Search API (text mode).
      // Use for current hours, prices, reviews, events — anything requiring live data.
      const { query, count } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google API key not configured' };
      }
      if (!GOOGLE_CUSTOM_SEARCH_CX) {
        return {
          error: 'Web search not configured. GOOGLE_CUSTOM_SEARCH_CX secret is missing.',
          suggestion:
            'Set up a Custom Search Engine at https://programmablesearchengine.google.com and add GOOGLE_CUSTOM_SEARCH_CX to Supabase secrets.',
        };
      }

      const num = Math.min(Number(count) || 5, 10);
      const csUrl = new URL('https://www.googleapis.com/customsearch/v1');
      csUrl.searchParams.set('q', String(query));
      csUrl.searchParams.set('num', String(num));
      csUrl.searchParams.set('cx', GOOGLE_CUSTOM_SEARCH_CX);
      csUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

      const csResponse = await withCircuitBreaker('google-search', () =>
        fetch(csUrl.toString(), { signal: AbortSignal.timeout(8_000) }),
      );
      if (!csResponse.ok) {
        const errText = await csResponse.text().catch(() => '');
        return {
          error: `Web search failed (${csResponse.status})`,
          details: errText.slice(0, 200),
        };
      }

      const csData = await csResponse.json();
      return {
        success: true,
        query: String(query),
        results: ((csData.items as Array<Record<string, unknown>>) || []).map(item => ({
          title: String(item.title || ''),
          url: String(item.link || ''),
          snippet: String(item.snippet || ''),
          domain: String(item.displayLink || ''),
        })),
      };
    }

    case 'getDistanceMatrix': {
      // Distance Matrix API: travel times from multiple origins to multiple destinations.
      // Use for "how long from hotel to each restaurant?" or multi-stop planning.
      const { origins, destinations, mode } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google API key not configured' };
      }

      const originList: string[] = Array.isArray(origins)
        ? (origins as unknown[]).map(String)
        : [String(origins)];
      const destList: string[] = Array.isArray(destinations)
        ? (destinations as unknown[]).map(String)
        : [String(destinations)];

      const validModes = new Set(['driving', 'walking', 'bicycling', 'transit']);
      const travelMode = validModes.has(String(mode)) ? String(mode) : 'driving';

      const params = new URLSearchParams();
      params.set('origins', originList.join('|'));
      params.set('destinations', destList.join('|'));
      params.set('mode', travelMode);
      params.set('key', GOOGLE_MAPS_API_KEY);

      const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
      const dmResponse = await withCircuitBreaker('google-maps', () =>
        fetch(dmUrl, { signal: AbortSignal.timeout(10_000) }),
      );

      if (!dmResponse.ok) {
        return { error: `Distance Matrix API failed (${dmResponse.status})` };
      }

      const dmData = await dmResponse.json();
      if (dmData.status !== 'OK') {
        return { error: `Distance Matrix error: ${dmData.status}` };
      }

      const originAddresses: string[] = dmData.origin_addresses || [];
      const destAddresses: string[] = dmData.destination_addresses || [];

      return {
        success: true,
        travelMode,
        origins: originAddresses,
        destinations: destAddresses,
        rows: ((dmData.rows as Array<{ elements: Array<Record<string, unknown>> }>) || []).map(
          (row, i) => ({
            origin: originAddresses[i] ?? originList[i],
            elements: (row.elements || []).map((el: Record<string, unknown>, j: number) => ({
              destination: destAddresses[j] ?? destList[j],
              status: String(el.status || 'UNKNOWN'),
              durationText: (el.duration as { text?: string } | null)?.text ?? null,
              durationSeconds: (el.duration as { value?: number } | null)?.value ?? null,
              distanceText: (el.distance as { text?: string } | null)?.text ?? null,
              distanceMeters: (el.distance as { value?: number } | null)?.value ?? null,
            })),
          }),
        ),
      };
    }

    case 'validateAddress': {
      // Address Validation API: clean up and geocode an address the user dictated.
      // Returns formatted address, lat/lng, and component breakdown.
      const { address } = args;
      if (!GOOGLE_MAPS_API_KEY) {
        return { error: 'Google API key not configured' };
      }

      const avResponse = await withCircuitBreaker('google-maps', () =>
        fetch('https://addressvalidation.googleapis.com/v1:validateAddress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          },
          body: JSON.stringify({
            address: { addressLines: [String(address)] },
          }),
          signal: AbortSignal.timeout(8_000),
        }),
      );

      if (!avResponse.ok) {
        const errBody = await avResponse.text().catch(() => '');
        return {
          error: `Address Validation failed (${avResponse.status})`,
          details: errBody.slice(0, 200),
        };
      }

      const avData = await avResponse.json();
      const result = avData.result as Record<string, unknown> | null;

      const geocode = result?.geocode as Record<string, unknown> | null;
      const location = geocode?.location as { latitude?: number; longitude?: number } | null;
      const addr = result?.address as Record<string, unknown> | null;
      const verdict = result?.verdict as Record<string, unknown> | null;

      return {
        success: true,
        formattedAddress: String(addr?.formattedAddress || ''),
        lat: location?.latitude ?? null,
        lng: location?.longitude ?? null,
        addressComplete: verdict?.addressComplete ?? null,
        hasUnconfirmedComponents: verdict?.hasUnconfirmedComponents ?? null,
        components: (addr?.addressComponents as unknown[]) ?? [],
      };
    }

    // ========== TRIP WRITE TOOLS (Concierge Autonomous Actions) ==========

    case 'savePlace': {
      const { name, url, description, category } = args;
      const placeName = String(name || '').trim();
      if (!placeName) return { error: 'Place name is required' };

      // Build a Google Maps search URL if no explicit URL provided
      const placeUrl = url
        ? String(url)
        : `https://www.google.com/maps/search/${encodeURIComponent(placeName)}`;

      const validCategories = new Set([
        'attraction',
        'accommodation',
        'activity',
        'appetite',
        'other',
      ]);
      const safeCategory = validCategories.has(String(category)) ? String(category) : 'other';

      // Idempotency: if an identical (trip_id,url,title) row exists in the last
      // 10 minutes, return it instead of inserting a duplicate. Handles rapid
      // double-calls from retry loops or the LLM re-emitting the same tool call.
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: existing } = await supabase
        .from('trip_links')
        .select('*')
        .eq('trip_id', tripId)
        .eq('url', placeUrl)
        .eq('title', placeName)
        .gte('created_at', tenMinAgo)
        .maybeSingle();

      if (existing) {
        return {
          success: true,
          link: existing,
          actionType: 'save_place',
          deduped: true,
          message: `"${placeName}" is already saved to this trip.`,
        };
      }

      const { data, error } = await supabase
        .from('trip_links')
        .insert({
          trip_id: tripId,
          title: placeName,
          url: placeUrl,
          description: description ? String(description).substring(0, 500) : null,
          category: safeCategory,
          added_by: userId || '',
        })
        .select()
        .single();
      if (error) throw error;
      return {
        success: true,
        link: data,
        actionType: 'save_place',
        message: `Saved "${placeName}" to trip places (${safeCategory})`,
      };
    }

    case 'saveLink': {
      const { url, title, description, category, idempotency_key, tool_call_id } = args;
      const rawUrl = String(url || '').trim();
      if (!rawUrl) return { error: 'url is required' };

      let parsedHost = '';
      try {
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return { error: 'Only http(s) URLs can be saved' };
        }
        parsedHost = parsed.hostname.replace(/^www\./, '');
      } catch {
        return { error: 'Invalid URL format' };
      }

      const linkTitle = String(title || '').trim() || parsedHost || rawUrl;
      const validCategories = new Set([
        'attraction',
        'accommodation',
        'activity',
        'appetite',
        'other',
      ]);
      const safeCategory = validCategories.has(String(category)) ? String(category) : 'other';
      const safeDescription = description ? String(description).substring(0, 500) : null;

      // Idempotency: same (trip_id,url) inside 10 min returns existing row (no pending audit).
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: existing } = await supabase
        .from('trip_links')
        .select('*')
        .eq('trip_id', tripId)
        .eq('url', rawUrl)
        .gte('created_at', tenMinAgo)
        .maybeSingle();

      if (existing) {
        return {
          success: true,
          link: existing,
          actionType: 'save_link',
          deduped: true,
          message: `This link is already saved to the trip.`,
        };
      }

      // Buffered confirm-card flow (mirrors createTask/createPoll).
      const dedupeId = tool_call_id || idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'saveLink',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            url: rawUrl,
            title: linkTitle,
            description: safeDescription,
            category: safeCategory,
            added_by: userId || '',
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      let insertedLink: Record<string, unknown> | null = null;
      const { data, error: writeErr } = await supabase
        .from('trip_links')
        .insert({
          trip_id: tripId,
          title: linkTitle,
          url: rawUrl,
          description: safeDescription,
          category: safeCategory,
          added_by: userId || '',
        })
        .select()
        .single();

      if (!writeErr && data) {
        insertedLink = data;
        promoted = true;
        await supabase
          .from('trip_pending_actions')
          .update({
            status: 'confirmed',
            resolved_at: new Date().toISOString(),
            resolved_by: userId,
          })
          .eq('id', pending.id)
          .eq('status', 'pending');
      } else if (writeErr) {
        console.warn(
          '[Tool] saveLink fast-path failed, falling back to client confirm:',
          writeErr.message,
        );
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        link: insertedLink,
        actionType: 'save_link',
        message: promoted
          ? `Saved link "${linkTitle}" to the trip.`
          : `I'd like to save "${linkTitle}" to the trip. Please confirm in the trip chat.`,
      };
    }

    case 'setBasecamp': {
      const { scope, name, address, lat, lng } = args;
      const basecampName = String(name || '').trim();
      const basecampAddress = String(address || '').trim();
      if (!basecampAddress && !basecampName) {
        return { error: 'Either name or address is required for basecamp' };
      }

      if (scope === 'personal') {
        if (!userId) return { error: 'Authentication required to set personal basecamp' };

        // Upsert personal basecamp
        const { data: existing } = await supabase
          .from('trip_personal_basecamps')
          .select('id')
          .eq('trip_id', tripId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from('trip_personal_basecamps')
            .update({
              name: basecampName || null,
              address: basecampAddress || basecampName,
              latitude: lat != null ? Number(lat) : null,
              longitude: lng != null ? Number(lng) : null,
            })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          return {
            success: true,
            basecamp: data,
            actionType: 'set_basecamp',
            scope: 'personal',
            message: `Updated your personal basecamp to "${basecampName || basecampAddress}"`,
          };
        }

        const { data, error } = await supabase
          .from('trip_personal_basecamps')
          .insert({
            trip_id: tripId,
            user_id: userId,
            name: basecampName || null,
            address: basecampAddress || basecampName,
            latitude: lat != null ? Number(lat) : null,
            longitude: lng != null ? Number(lng) : null,
          })
          .select()
          .single();
        if (error) throw error;
        return {
          success: true,
          basecamp: data,
          actionType: 'set_basecamp',
          scope: 'personal',
          message: `Set your personal basecamp to "${basecampName || basecampAddress}"`,
        };
      }

      // Trip basecamp - update the trips table directly
      const updatePayload: Record<string, unknown> = {
        basecamp_name: basecampName || null,
        basecamp_address: basecampAddress || basecampName,
      };
      if (lat != null) updatePayload.basecamp_latitude = Number(lat);
      if (lng != null) updatePayload.basecamp_longitude = Number(lng);

      const { data, error } = await supabase
        .from('trips')
        .update(updatePayload)
        .eq('id', tripId)
        .select('id, basecamp_name, basecamp_address, basecamp_latitude, basecamp_longitude')
        .single();
      if (error) throw error;
      return {
        success: true,
        basecamp: data,
        actionType: 'set_basecamp',
        scope: 'trip',
        message: `Set trip basecamp to "${basecampName || basecampAddress}"`,
      };
    }

    case 'addToAgenda': {
      const { eventId, title, description, sessionDate, startTime, endTime, location, speakers } =
        args;
      const agendaTitle = String(title || '').trim();
      if (!agendaTitle) return { error: 'Agenda session title is required' };
      if (!eventId) return { error: 'Event ID is required for agenda items' };

      // Idempotency: same (event_id,title,session_date,start_time) inside 10 min
      // returns the existing row instead of inserting a duplicate.
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const dedupeQuery = supabase
        .from('event_agenda_items')
        .select('*')
        .eq('event_id', eventId)
        .eq('title', agendaTitle)
        .gte('created_at', tenMinAgo);
      if (sessionDate) dedupeQuery.eq('session_date', sessionDate);
      if (startTime) dedupeQuery.eq('start_time', startTime);
      const { data: existingAgenda } = await dedupeQuery.maybeSingle();

      if (existingAgenda) {
        return {
          success: true,
          agendaItem: existingAgenda,
          actionType: 'add_to_agenda',
          deduped: true,
          message: `"${agendaTitle}" is already on the agenda.`,
        };
      }

      const { data, error } = await supabase
        .from('event_agenda_items')
        .insert({
          event_id: eventId,
          title: agendaTitle,
          description: description || null,
          session_date: sessionDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          location: location || null,
          speakers: Array.isArray(speakers) ? speakers : null,
          created_by: userId || null,
        })
        .select()
        .single();
      if (error) throw error;
      return {
        success: true,
        agendaItem: data,
        actionType: 'add_to_agenda',
        message: `Added "${agendaTitle}" to event agenda`,
      };
    }

    case 'searchFlights': {
      const { origin, destination, departureDate, returnDate, passengers } = args;

      // Construct a Google Flights URL
      // Format: https://www.google.com/travel/flights?q=Flights%20to%20DEST%20from%20ORIG%20on%20DATE
      const q = `Flights to ${destination} from ${origin} on ${departureDate}${returnDate ? ` return ${returnDate}` : ''}`;
      const encodedQ = encodeURIComponent(q);
      const url = `https://www.google.com/travel/flights?q=${encodedQ}`;

      return {
        success: true,
        origin,
        destination,
        departureDate,
        returnDate,
        passengers: passengers || 1,
        deeplink: url,
        message: `Found flight options from ${origin} to ${destination}`,
      };
    }

    case 'emitSmartImportPreview': {
      const { events: extractedEvents } = args;
      if (!Array.isArray(extractedEvents) || extractedEvents.length === 0) {
        return { error: 'No events provided for import preview' };
      }

      // Fetch existing trip events to detect duplicates
      const { data: existingEvents } = await supabase
        .from('trip_events')
        .select('title, start_time, end_time')
        .eq('trip_id', tripId);

      const existingSet = new Set(
        (existingEvents || []).map(
          (e: { title: string; start_time: string }) =>
            `${e.title.toLowerCase().trim()}|${new Date(e.start_time).toISOString()}`,
        ),
      );

      const previewEvents = extractedEvents.map(
        (evt: {
          title: string;
          datetime: string;
          endDatetime?: string;
          location?: string;
          category?: string;
          notes?: string;
        }) => {
          const startIso = new Date(evt.datetime).toISOString();
          const endIso = evt.endDatetime
            ? new Date(evt.endDatetime).toISOString()
            : new Date(new Date(evt.datetime).getTime() + 60 * 60 * 1000).toISOString();

          const dupeKey = `${evt.title.toLowerCase().trim()}|${startIso}`;
          const isDuplicate = existingSet.has(dupeKey);

          const validCategories = new Set([
            'dining',
            'lodging',
            'activity',
            'transportation',
            'entertainment',
            'other',
          ]);
          const category = validCategories.has(evt.category || '') ? evt.category : 'other';

          return {
            title: evt.title,
            startTime: startIso,
            endTime: endIso,
            location: evt.location || null,
            category,
            notes: evt.notes || null,
            isDuplicate,
          };
        },
      );

      return {
        success: true,
        previewEvents,
        tripId,
        totalEvents: previewEvents.length,
        duplicateCount: previewEvents.filter((e: { isDuplicate: boolean }) => e.isDuplicate).length,
        actionType: 'smart_import_preview',
        message: `Found ${previewEvents.length} event(s) to import`,
      };
    }

    case 'emitReservationDraft': {
      const { placeQuery, startTimeISO, partySize, reservationName, notes } = args;

      const query = String(placeQuery || '').trim();
      if (!query) return { error: 'placeQuery is required to build a reservation draft' };

      // Internally search for the place to enrich the draft with real data
      let placeId: string | null = null;
      let placeName = query;
      let address = '';
      let lat: number | null = null;
      let lng: number | null = null;
      let phone: string | null = null;
      let websiteUrl: string | null = null;
      let bookingUrl: string | null = null;

      try {
        const searchResult = await _executeImpl(
          supabase,
          'searchPlaces',
          { query },
          tripId,
          userId,
          locationContext,
        );
        if (searchResult.success && searchResult.places?.length > 0) {
          const topPlace = searchResult.places[0];
          placeId = topPlace.placeId || null;
          placeName = topPlace.name || placeName;
          address = topPlace.address || '';
        }

        // Enrich with details (phone, website, coordinates)
        if (placeId) {
          const detailsResult = await _executeImpl(
            supabase,
            'getPlaceDetails',
            { placeId },
            tripId,
            userId,
            locationContext,
          );
          if (detailsResult.success) {
            placeName = detailsResult.name || placeName;
            address = detailsResult.address || address;
            phone = detailsResult.phone || null;
            websiteUrl = detailsResult.website || null;
            bookingUrl = detailsResult.website || null;
          }
        }

        // Get coordinates via address validation if not yet available
        if (!lat && address) {
          const addrResult = await _executeImpl(
            supabase,
            'validateAddress',
            { address },
            tripId,
            userId,
            locationContext,
          );
          if (addrResult.success) {
            lat = addrResult.lat ?? null;
            lng = addrResult.lng ?? null;
          }
        }
      } catch (enrichError) {
        console.error('[emitReservationDraft] Place enrichment failed:', enrichError);
        // Continue with partial data — the draft is still usable
      }

      const draft = {
        id: crypto.randomUUID(),
        tripId,
        placeId,
        placeName,
        address,
        lat,
        lng,
        phone,
        websiteUrl,
        bookingUrl,
        startTimeISO: startTimeISO || null,
        partySize: Number(partySize) || 2,
        reservationName: String(reservationName || ''),
        notes: String(notes || ''),
      };

      return {
        success: true,
        draft,
        actionType: 'reservation_draft',
        message: `Reservation draft created for ${placeName}`,
      };
    }

    // ========== UPDATE / DELETE TOOLS ==========

    case 'updateCalendarEvent': {
      const { eventId, title, datetime, endDatetime, location, notes } = args;
      if (!eventId) return { error: 'eventId is required' };

      // Verify event belongs to this trip before updating
      const { data: existing, error: fetchErr } = await supabase
        .from('trip_events')
        .select('id, trip_id, created_by')
        .eq('id', eventId)
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) {
        return { error: 'Event not found in this trip' };
      }

      const updatePayload: Record<string, unknown> = {};
      if (title) updatePayload.title = String(title);
      if (datetime) {
        updatePayload.start_time = new Date(datetime).toISOString();
      }
      if (endDatetime) {
        updatePayload.end_time = new Date(endDatetime).toISOString();
      }
      if (location !== undefined) updatePayload.location = location || null;
      if (notes !== undefined) updatePayload.description = notes || null;

      if (Object.keys(updatePayload).length === 0) {
        return { error: 'No fields to update' };
      }

      const { data, error } = await supabase
        .from('trip_events')
        .update(updatePayload)
        .eq('id', eventId)
        .eq('trip_id', tripId)
        .select()
        .single();
      if (error) throw error;
      return {
        success: true,
        event: data,
        actionType: 'update_calendar_event',
        message: `Updated event "${data.title}"`,
      };
    }

    case 'deleteCalendarEvent': {
      const { eventId } = args;
      if (!eventId) return { error: 'eventId is required' };

      // Verify event belongs to this trip
      const { data: existing, error: fetchErr } = await supabase
        .from('trip_events')
        .select('id, title, trip_id')
        .eq('id', eventId)
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) {
        return { error: 'Event not found in this trip' };
      }

      const { error } = await supabase
        .from('trip_events')
        .delete()
        .eq('id', eventId)
        .eq('trip_id', tripId);
      if (error) throw error;
      return {
        success: true,
        actionType: 'delete_calendar_event',
        message: `Deleted event "${existing.title}"`,
      };
    }

    case 'emitBulkDeletePreview': {
      const {
        titleContains,
        locationContains,
        afterDate,
        beforeDate,
        category,
        eventTitles,
        matchMode,
      } = args;

      // Fetch trip timezone for date boundary normalization
      const { data: tripRow } = await supabase
        .from('trips')
        .select('primary_timezone')
        .eq('id', tripId)
        .single();
      const tz = tripRow?.primary_timezone || 'UTC';

      // Convert a local date + time-of-day in the trip timezone to a UTC ISO string.
      // Uses Intl to derive the UTC offset for the trip timezone on that date.
      function tripLocalToUTC(dateStr: string, h: number, m: number, s: number): string {
        const isoDate = String(dateStr).split('T')[0];
        const ref = new Date(`${isoDate}T12:00:00Z`);
        const utcStr = ref.toLocaleString('en-US', { timeZone: 'UTC' });
        const tzStr = ref.toLocaleString('en-US', { timeZone: tz });
        const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
        const local = new Date(
          `${isoDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
        );
        return new Date(local.getTime() + offsetMs).toISOString();
      }

      // Build query with date boundaries
      let bdQuery = supabase
        .from('trip_events')
        .select('id, title, start_time, end_time, location, event_category, description')
        .eq('trip_id', tripId);

      if (afterDate) {
        // End of day in trip timezone — exclusive of the given date
        bdQuery = bdQuery.gt('start_time', tripLocalToUTC(String(afterDate), 23, 59, 59));
      }
      if (beforeDate) {
        // Start of day in trip timezone — exclusive of the given date
        bdQuery = bdQuery.lt('start_time', tripLocalToUTC(String(beforeDate), 0, 0, 0));
      }
      if (category) bdQuery = bdQuery.eq('event_category', String(category));

      const { data: bdEvents, error: bdError } = await bdQuery.order('start_time');
      if (bdError) throw bdError;

      let bdFiltered = bdEvents || [];

      // Text filter: titleContains
      if (titleContains) {
        const needle = String(titleContains).toLowerCase();
        bdFiltered = bdFiltered.filter((e: { title: string }) =>
          e.title.toLowerCase().includes(needle),
        );
      }
      // Text filter: locationContains
      if (locationContains) {
        const needle = String(locationContains).toLowerCase();
        bdFiltered = bdFiltered.filter((e: { location: string | null }) =>
          e.location?.toLowerCase().includes(needle),
        );
      }
      // Exact-first matching for eventTitles
      if (Array.isArray(eventTitles) && eventTitles.length > 0) {
        const mode = String(matchMode || 'auto');
        const needles = eventTitles.map((t: string) => String(t).toLowerCase().trim());

        if (mode === 'exact') {
          bdFiltered = bdFiltered.filter((e: { title: string }) =>
            needles.includes(e.title.toLowerCase().trim()),
          );
        } else if (mode === 'contains') {
          bdFiltered = bdFiltered.filter((e: { title: string }) =>
            needles.some((n: string) => e.title.toLowerCase().includes(n)),
          );
        } else {
          // auto: exact → startsWith → contains (narrowest match wins)
          let matched = bdFiltered.filter((e: { title: string }) =>
            needles.includes(e.title.toLowerCase().trim()),
          );
          if (matched.length === 0) {
            matched = bdFiltered.filter((e: { title: string }) =>
              needles.some((n: string) => e.title.toLowerCase().startsWith(n)),
            );
          }
          if (matched.length === 0) {
            matched = bdFiltered.filter((e: { title: string }) =>
              needles.some((n: string) => e.title.toLowerCase().includes(n)),
            );
          }
          bdFiltered = matched;
        }
      }

      if (bdFiltered.length === 0) {
        return { success: false, error: 'No matching events found' };
      }

      const matchedIds = bdFiltered.map((e: { id: string }) => e.id);

      // Store preview as pending action for server-side verification on confirm
      const { data: pendingAction, error: paError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId,
          tool_name: 'bulkDeleteCalendarEvents',
          tool_call_id: args.idempotency_key || crypto.randomUUID(),
          payload: {
            matched_event_ids: matchedIds,
            criteria: {
              titleContains,
              locationContains,
              afterDate,
              beforeDate,
              category,
              eventTitles,
              matchMode,
            },
            match_count: matchedIds.length,
          },
          status: 'pending',
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (paError) throw paError;

      const bdPreviewEvents = bdFiltered.map(
        (e: {
          id: string;
          title: string;
          start_time: string;
          end_time: string | null;
          location: string | null;
          event_category: string | null;
          description: string | null;
        }) => ({
          id: e.id,
          title: e.title,
          startTime: e.start_time,
          endTime: e.end_time || '',
          location: e.location || null,
          category: e.event_category || 'other',
          notes: e.description || null,
          isDuplicate: false,
        }),
      );

      return {
        success: true,
        previewEvents: bdPreviewEvents,
        previewToken: pendingAction.id,
        tripId,
        totalEvents: bdPreviewEvents.length,
        duplicateCount: 0,
        actionType: 'bulk_delete_preview',
        message: `Found ${bdPreviewEvents.length} event(s) matching your criteria`,
      };
    }

    case 'bulkDeleteCalendarEvents': {
      const { previewToken, selectedEventIds } = args;
      if (!previewToken) return { error: 'previewToken is required' };
      if (!Array.isArray(selectedEventIds) || selectedEventIds.length === 0) {
        return { error: 'selectedEventIds must be a non-empty array' };
      }

      // Verify preview token belongs to this user+trip and is still pending
      const { data: preview, error: pErr } = await supabase
        .from('trip_pending_actions')
        .select('payload, status, trip_id, user_id')
        .eq('id', String(previewToken))
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .single();

      if (pErr || !preview) return { error: 'Invalid or expired preview token' };
      if (preview.status !== 'pending') return { error: 'Preview already resolved' };

      const allowedIds: string[] = (preview.payload as { matched_event_ids: string[] })
        .matched_event_ids;

      // Verify selectedEventIds is a subset of the preview
      const allowedSet = new Set(allowedIds);
      const invalidIds = selectedEventIds.filter((id: string) => !allowedSet.has(String(id)));
      if (invalidIds.length > 0) {
        return { error: `${invalidIds.length} event(s) not in original preview` };
      }

      const idsToDelete = selectedEventIds.map((id: string) => String(id));

      // Single bulk delete query
      const { data: deleted, error: delErr } = await supabase
        .from('trip_events')
        .delete()
        .in('id', idsToDelete)
        .eq('trip_id', tripId)
        .select('id');
      if (delErr) throw delErr;

      // Mark preview as confirmed
      await supabase
        .from('trip_pending_actions')
        .update({
          status: 'confirmed',
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq('id', String(previewToken));

      // trip_activity_log triggers fire automatically per deleted row (trg_event_activity)
      const deletedIds = new Set((deleted || []).map((d: { id: string }) => d.id));
      const alreadyMissing = idsToDelete.filter((id: string) => !deletedIds.has(id));

      return {
        success: true,
        deleted: deletedIds.size,
        alreadyMissing: alreadyMissing.length,
        failed: 0,
        actionType: 'bulk_delete_result',
        message: `Removed ${deletedIds.size} event(s)${alreadyMissing.length > 0 ? `. ${alreadyMissing.length} were already gone.` : ''}`,
      };
    }

    case 'updateTask': {
      const {
        taskId,
        title,
        description,
        assignee,
        dueDate,
        completed,
        idempotency_key,
        tool_call_id,
      } = args;
      if (!taskId) return { error: 'taskId is required' };

      // Verify task belongs to this trip (guard before audit row)
      const { data: existing, error: fetchErr } = await supabase
        .from('trip_tasks')
        .select('id, trip_id, title')
        .eq('id', taskId)
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) {
        return { error: 'Task not found in this trip' };
      }

      const updatePayload: Record<string, unknown> = {};
      if (title) updatePayload.title = String(title);
      if (description !== undefined) updatePayload.description = description || null;
      if (dueDate !== undefined) updatePayload.due_at = dueDate || null;
      if (completed !== undefined) {
        updatePayload.completed = Boolean(completed);
        updatePayload.completed_at = completed ? new Date().toISOString() : null;
      }

      if (Object.keys(updatePayload).length === 0) {
        return { error: 'No fields to update' };
      }

      // Buffered confirm-card flow
      const dedupeId = tool_call_id || idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'updateTask',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: { task_id: taskId, assignee: assignee || null, ...updatePayload },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      let updatedRow: Record<string, unknown> | null = null;
      const { data, error: writeErr } = await supabase
        .from('trip_tasks')
        .update(updatePayload)
        .eq('id', taskId)
        .eq('trip_id', tripId)
        .select()
        .single();

      if (!writeErr && data) {
        updatedRow = data;
        promoted = true;
        await supabase
          .from('trip_pending_actions')
          .update({
            status: 'confirmed',
            resolved_at: new Date().toISOString(),
            resolved_by: userId,
          })
          .eq('id', pending.id)
          .eq('status', 'pending');
      } else if (writeErr) {
        console.warn(
          '[Tool] updateTask fast-path failed, falling back to client confirm:',
          writeErr.message,
        );
      }

      const taskTitle = (updatedRow?.title as string) || existing.title;
      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        task: updatedRow,
        actionType: 'update_task',
        message: promoted
          ? `Updated task "${taskTitle}"${completed ? ' (marked complete)' : ''}`
          : `I'd like to update task "${taskTitle}". Please confirm in the trip chat.`,
      };
    }

    case 'deleteTask': {
      const { taskId, idempotency_key, tool_call_id } = args;
      if (!taskId) return { error: 'taskId is required' };

      // Verify task belongs to this trip (guard before audit row)
      const { data: existing, error: fetchErr } = await supabase
        .from('trip_tasks')
        .select('id, title, trip_id')
        .eq('id', taskId)
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) {
        return { error: 'Task not found in this trip' };
      }

      // Buffered confirm-card flow (mirrors updateTask).
      const dedupeId = tool_call_id || idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'deleteTask',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: { task_id: taskId, title: existing.title },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      const { error: writeErr } = await supabase
        .from('trip_tasks')
        .delete()
        .eq('id', taskId)
        .eq('trip_id', tripId);

      if (!writeErr) {
        promoted = true;
        await supabase
          .from('trip_pending_actions')
          .update({
            status: 'confirmed',
            resolved_at: new Date().toISOString(),
            resolved_by: userId,
          })
          .eq('id', pending.id)
          .eq('status', 'pending');
      } else {
        console.warn(
          '[Tool] deleteTask fast-path failed, falling back to client confirm:',
          writeErr.message,
        );
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'delete_task',
        message: promoted
          ? `Deleted task "${existing.title}"`
          : `I'd like to delete task "${existing.title}". Please confirm in the trip chat.`,
      };
    }

    // ========== UNIFIED TRIP SEARCH ==========

    case 'searchTripData': {
      const { query, types } = args;
      const searchQuery = String(query || '')
        .trim()
        .toLowerCase();
      if (!searchQuery) return { error: 'Search query is required' };

      const searchTypes: string[] = Array.isArray(types)
        ? types.map(String)
        : ['calendar', 'task', 'poll', 'link', 'payment'];

      const results: Record<string, unknown[]> = {};

      // Search calendar events
      if (searchTypes.includes('calendar')) {
        const { data: events } = await supabase
          .from('trip_events')
          .select('id, title, start_time, end_time, location, description')
          .eq('trip_id', tripId)
          .or(
            `title.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`,
          )
          .order('start_time', { ascending: true })
          .limit(10);
        results.calendar = events || [];
      }

      // Search tasks
      if (searchTypes.includes('task')) {
        const { data: tasks } = await supabase
          .from('trip_tasks')
          .select('id, title, description, completed, due_at')
          .eq('trip_id', tripId)
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .limit(10);
        results.tasks = tasks || [];
      }

      // Search polls
      if (searchTypes.includes('poll')) {
        const { data: polls } = await supabase
          .from('trip_polls')
          .select('id, question, options, status')
          .eq('trip_id', tripId)
          .ilike('question', `%${searchQuery}%`)
          .limit(10);
        results.polls = polls || [];
      }

      // Search trip links
      if (searchTypes.includes('link')) {
        const { data: links } = await supabase
          .from('trip_links')
          .select('id, title, url, description, category')
          .eq('trip_id', tripId)
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .limit(10);
        results.links = links || [];
      }

      // Search payments
      if (searchTypes.includes('payment')) {
        const { data: payments } = await supabase
          .from('trip_payment_messages')
          .select('id, description, amount, currency, created_at')
          .eq('trip_id', tripId)
          .ilike('description', `%${searchQuery}%`)
          .limit(10);
        results.payments = payments || [];
      }

      const totalResults = Object.values(results).reduce(
        (sum, arr) => sum + (arr as unknown[]).length,
        0,
      );

      return {
        success: true,
        query: searchQuery,
        totalResults,
        results,
        message: `Found ${totalResults} result(s) for "${searchQuery}"`,
      };
    }

    // ========== TRIP ARTIFACT SEMANTIC SEARCH ==========

    case 'searchTripArtifacts': {
      const { query: artifactQuery, artifact_types, limit: artifactLimit } = args;
      const searchText = String(artifactQuery || '').trim();
      if (!searchText) return { error: 'Search query is required' };

      try {
        // Import multimodal embeddings at call time to avoid top-level import issues
        const { embedText } = await import('./multimodalEmbeddings.ts');
        const queryEmbedding = await embedText(searchText);

        const { data: artifacts, error: searchErr } = await supabase.rpc('search_trip_artifacts', {
          p_trip_id: tripId,
          p_query_embedding: queryEmbedding.embedding,
          p_match_threshold: 0.45,
          p_match_count: Number(artifactLimit) || 5,
          p_artifact_types: Array.isArray(artifact_types) ? artifact_types : null,
          p_source_types: null,
          p_created_after: null,
          p_created_before: null,
          p_creator_id: null,
        });

        if (searchErr) throw searchErr;

        const formattedArtifacts = (artifacts || []).map((a: Record<string, unknown>) => ({
          id: a.id,
          type: a.artifact_type,
          fileName: a.file_name,
          summary: a.ai_summary || (a.extracted_text as string)?.substring(0, 300) || '',
          similarity: a.similarity,
          createdAt: a.created_at,
        }));

        return {
          success: true,
          query: searchText,
          totalResults: formattedArtifacts.length,
          artifacts: formattedArtifacts,
          message:
            formattedArtifacts.length > 0
              ? `Found ${formattedArtifacts.length} artifact(s) matching "${searchText}"`
              : `No artifacts found matching "${searchText}"`,
        };
      } catch (artifactErr) {
        console.error('[Tool] searchTripArtifacts error:', artifactErr);
        return {
          success: false,
          error: 'Artifact search failed',
          query: searchText,
          totalResults: 0,
          artifacts: [],
        };
      }
    }

    // ========== CALENDAR CONFLICT DETECTION ==========

    case 'detectCalendarConflicts': {
      const { datetime, endDatetime } = args;
      if (!datetime) return { error: 'datetime is required' };

      const startTime = new Date(datetime).toISOString();
      const endTime = endDatetime
        ? new Date(endDatetime).toISOString()
        : new Date(new Date(datetime).getTime() + 60 * 60 * 1000).toISOString();

      // Find overlapping events: starts before proposed end AND ends after proposed start
      const { data: conflicts, error } = await supabase
        .from('trip_events')
        .select('id, title, start_time, end_time, location')
        .eq('trip_id', tripId)
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .order('start_time', { ascending: true });

      if (error) throw error;

      return {
        success: true,
        hasConflicts: (conflicts || []).length > 0,
        conflicts: conflicts || [],
        proposedStart: startTime,
        proposedEnd: endTime,
        message:
          (conflicts || []).length > 0
            ? `Found ${conflicts!.length} conflicting event(s)`
            : 'No conflicts found',
      };
    }

    // ========== BROADCAST TOOL ==========

    case 'createBroadcast': {
      const { message, priority } = args;
      const broadcastMessage = String(message || '').trim();
      if (!broadcastMessage) return { error: 'Broadcast message is required' };
      if (!userId) return { error: 'Authentication required to send broadcasts' };

      const validPriorities = new Set(['normal', 'urgent']);
      const safePriority = validPriorities.has(String(priority)) ? String(priority) : 'normal';

      // Broadcasts pin a message to every member and trigger notification fanout
      // (notify_on_broadcast -> fanout_event_key dedup). Route through the
      // pending-actions buffer so the action is audited and a dropped fast-path
      // leaves a recoverable confirm card -- mirrors addExpense.
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId,
          tool_name: 'createBroadcast',
          payload: {
            message: broadcastMessage,
            priority: safePriority,
            created_by: userId,
            trip_id: tripId,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      let broadcast: any = null;
      const { data: row, error: insertErr } = await supabase
        .from('broadcasts')
        .insert({
          trip_id: tripId,
          created_by: userId,
          message: broadcastMessage,
          priority: safePriority,
          is_sent: true,
        })
        .select()
        .single();
      if (!insertErr && row) {
        broadcast = row;
        promoted = true;
        await markPendingConfirmed(supabase, pending.id, userId);
      } else if (insertErr) {
        console.warn('[Tool] createBroadcast fast-path failed, falling back:', insertErr.message);
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        broadcast,
        actionType: 'create_broadcast',
        message: promoted
          ? `Broadcast sent: "${broadcastMessage.substring(0, 80)}"${safePriority === 'urgent' ? ' (URGENT)' : ''}`
          : `I'd like to send a ${safePriority === 'urgent' ? 'URGENT ' : ''}broadcast: "${broadcastMessage.substring(0, 80)}". Please confirm in the trip chat.`,
      };
    }

    // ========== NOTIFICATION TOOL ==========

    case 'createNotification': {
      const { title, message, targetUserIds, type } = args;
      const notifTitle = String(title || '').trim();
      const notifMessage = String(message || '').trim();
      if (!notifTitle || !notifMessage) {
        return { error: 'Both title and message are required' };
      }
      if (!userId) return { error: 'Authentication required to send notifications' };

      // Resolve recipient list up-front so we can store it in the pending payload.
      let userIds: string[] = [];
      if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        userIds = targetUserIds.map(String);
      } else {
        const { data: members } = await supabase
          .from('trip_members')
          .select('user_id')
          .eq('trip_id', tripId);
        userIds = (members || []).map((m: { user_id: string }) => m.user_id);
      }

      if (userIds.length === 0) {
        return { error: 'No target users found' };
      }

      const safeType = String(type || 'concierge');

      // Audit + recoverable confirm row -- same shape as addExpense / createBroadcast.
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId,
          tool_name: 'createNotification',
          payload: {
            title: notifTitle,
            message: notifMessage,
            type: safeType,
            target_user_ids: userIds,
            created_by: userId,
            trip_id: tripId,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      const notifications = userIds.map((uid: string) => ({
        user_id: uid,
        trip_id: tripId,
        title: notifTitle,
        message: notifMessage,
        type: safeType,
        metadata: { source: 'ai_concierge', created_by: userId },
      }));

      let promoted = false;
      const { error: insertErr } = await supabase.from('notifications').insert(notifications);
      if (!insertErr) {
        promoted = true;
        await markPendingConfirmed(supabase, pending.id, userId);
      } else {
        console.warn(
          '[Tool] createNotification fast-path failed, falling back:',
          insertErr.message,
        );
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        recipientCount: userIds.length,
        actionType: 'create_notification',
        message: promoted
          ? `Notification sent to ${userIds.length} member(s): "${notifTitle}"`
          : `I'd like to notify ${userIds.length} member(s): "${notifTitle}". Please confirm in the trip chat.`,
      };
    }

    // ========== WEATHER FORECAST ==========

    case 'getWeatherForecast': {
      const { location, date } = args;
      if (!location) return { error: 'Location is required' };

      // Use web search to get weather data (free, no additional API key needed)
      const dateStr = date || 'today';
      const weatherQuery = `weather forecast ${location} ${dateStr}`;

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: weatherQuery, count: 3 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        location,
        date: dateStr,
        searchResults: searchResult.success ? searchResult.results : [],
        message: `Weather results for ${location} (${dateStr})`,
      };
    }

    // ========== CURRENCY CONVERSION ==========

    case 'convertCurrency': {
      const { amount, from, to } = args;
      if (!amount || !from || !to) {
        return { error: 'amount, from, and to currency codes are required' };
      }

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return { error: 'Amount must be a positive number' };
      }

      // Use the free exchangerate API
      const rateUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(String(from).toUpperCase())}`;
      const rateResponse = await withCircuitBreaker('exchange-rate', () =>
        fetch(rateUrl, { signal: AbortSignal.timeout(8_000) }),
      );

      if (!rateResponse.ok) {
        return { error: `Currency API failed (${rateResponse.status})` };
      }

      const rateData = await rateResponse.json();
      if (rateData.result !== 'success') {
        return { error: `Currency conversion failed: ${rateData['error-type'] || 'unknown'}` };
      }

      const toCurrency = String(to).toUpperCase();
      const rate = rateData.rates?.[toCurrency];
      if (!rate) {
        return { error: `Unknown currency code: ${toCurrency}` };
      }

      const converted = Math.round(numAmount * rate * 100) / 100;
      return {
        success: true,
        originalAmount: numAmount,
        originalCurrency: String(from).toUpperCase(),
        convertedAmount: converted,
        targetCurrency: toCurrency,
        exchangeRate: rate,
        rateDate: rateData.time_last_update_utc || null,
        message: `${numAmount} ${String(from).toUpperCase()} = ${converted} ${toCurrency}`,
      };
    }

    // ========== IMAGE GENERATION (Trip Header) ==========

    case 'generateTripImage': {
      const { prompt, style } = args;
      if (!GEMINI_API_KEY) {
        return { error: 'Gemini API key not configured for image generation' };
      }

      // Build a travel-specific image prompt
      const safeStyles = new Set(['photo', 'illustration', 'watercolor', 'minimal', 'vibrant']);
      const imageStyle = safeStyles.has(String(style)) ? String(style) : 'photo';

      const imagePrompt = `Generate a beautiful, high-quality ${imageStyle}-style travel image: ${String(prompt).substring(0, 500)}. The image should be suitable as a trip cover photo — wide landscape format, vibrant colors, no text overlays, no watermarks.`;

      // Use Gemini's image generation via Imagen
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`;
      const geminiResponse = await withCircuitBreaker('gemini', () =>
        fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: imagePrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '16:9',
              safetyFilterLevel: 'block_medium_and_above',
            },
          }),
          signal: AbortSignal.timeout(30_000),
        }),
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text().catch(() => '');
        console.error(`[Tool] generateTripImage failed (${geminiResponse.status}): ${errText}`);
        return {
          error: `Image generation failed (${geminiResponse.status})`,
          suggestion: 'Try a simpler prompt or different style',
        };
      }

      const geminiData = await geminiResponse.json();
      const prediction = geminiData.predictions?.[0];

      if (!prediction?.bytesBase64Encoded) {
        return { error: 'No image was generated. Try a different prompt.' };
      }

      // Store image in Supabase Storage
      const imageBytes = Uint8Array.from(atob(prediction.bytesBase64Encoded), (c: string) =>
        c.charCodeAt(0),
      );
      const fileName = `trip-headers/${tripId}/${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('trip-media')
        .upload(fileName, imageBytes, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) {
        console.error('[Tool] generateTripImage upload failed:', uploadError);
        return { error: 'Image generated but upload failed' };
      }

      const { data: urlData } = supabase.storage.from('trip-media').getPublicUrl(fileName);
      const publicUrl = urlData?.publicUrl || '';

      return {
        success: true,
        imageUrl: publicUrl,
        storagePath: fileName,
        prompt: String(prompt).substring(0, 200),
        style: imageStyle,
        actionType: 'generate_trip_image',
        message: `Generated trip image. You can preview it and set it as your trip header.`,
      };
    }

    case 'setTripHeaderImage': {
      const { imageUrl } = args;
      if (!imageUrl) return { error: 'imageUrl is required' };

      const { data, error } = await supabase
        .from('trips')
        .update({ cover_image_url: String(imageUrl) })
        .eq('id', tripId)
        .select('id, cover_image_url')
        .single();
      if (error) throw error;

      return {
        success: true,
        trip: data,
        actionType: 'set_trip_header',
        message: 'Trip header image updated!',
      };
    }

    // ========== WEB BROWSING / TRAVEL AGENT ==========

    case 'browseWebsite': {
      const { url, instruction } = args;
      if (!url) return { error: 'URL is required' };
      if (!GEMINI_API_KEY) {
        return { error: 'Gemini API key not configured for web browsing' };
      }

      const targetUrl = String(url).trim();
      // Basic URL validation
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        return { error: 'URL must start with http:// or https://' };
      }

      // Fetch the page content
      const pageResponse = await withCircuitBreaker('google-search', () =>
        fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(15_000),
          redirect: 'follow',
        }),
      );

      if (!pageResponse.ok) {
        return {
          error: `Failed to load page (${pageResponse.status})`,
          url: targetUrl,
        };
      }

      const html = await pageResponse.text();
      // Extract text content (strip HTML tags for LLM consumption)
      // Apply HTML stripping in a loop until stable to prevent bypass via nested patterns.
      // Use \s* in closing tags (</script\s*>) to match tags with optional whitespace like </script >.
      let textContent = html;
      let prevText: string;
      do {
        prevText = textContent;
        textContent = textContent
          .replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, '') // codeql[js/incomplete-sanitization] - False positive: loop-until-stable handles nested tags; output is LLM context only, never rendered
          .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, '') // codeql[js/incomplete-sanitization] - False positive: same loop-until-stable guarantee
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ');
      } while (textContent !== prevText);
      textContent = textContent.trim().substring(0, 15_000); // Cap at 15k chars for context window

      // Extract links that might be useful (reservation links, booking links)
      const linkMatches = html.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi) || [];
      const relevantLinks = linkMatches
        .map((link: string) => {
          const hrefMatch = link.match(/href="([^"]+)"/);
          const textMatch = link.match(/>([^<]*)</);
          return {
            url: hrefMatch?.[1] || '',
            text: (textMatch?.[1] || '').trim(),
          };
        })
        .filter(
          (l: { url: string; text: string }) =>
            l.text.length > 2 &&
            (l.url.startsWith('http') || l.url.startsWith('/')) &&
            /reserv|book|order|menu|hour|schedule|ticket|price|avail/i.test(l.text + l.url),
        )
        .slice(0, 20);

      const taskInstruction = instruction
        ? String(instruction)
        : 'Extract key information useful for travel planning';

      // Use Gemini to analyze the page content
      const browsingModel = normalizeGeminiModel(
        Deno.env.get('CONCIERGE_TOOL_MODEL') || Deno.env.get('BROWSE_WEBSITE_MODEL') || undefined,
        'flash',
      );
      const analysisUrl = `https://generativelanguage.googleapis.com/v1beta/models/${browsingModel}:generateContent?key=${GEMINI_API_KEY}`;
      const analysisResponse = await withCircuitBreaker('gemini', () =>
        fetch(analysisUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a travel agent assistant. Analyze this webpage content and ${taskInstruction}.\n\nPage URL: ${targetUrl}\n\nPage content:\n${textContent}`,
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 2000, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(20_000),
        }),
      );

      let analysis = '';
      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        analysis =
          analysisData.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not analyze page';
      }

      return {
        success: true,
        url: targetUrl,
        pageTitle: (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Unknown').trim(),
        analysis,
        relevantLinks,
        contentLength: textContent.length,
        actionType: 'browse_website',
        message: `Browsed ${targetUrl} — extracted travel-relevant information`,
      };
    }

    case 'makeReservation': {
      const { venue, datetime, partySize, name, phone, specialRequests, bookingUrl } = args;
      if (!venue) return { error: 'Venue name is required' };

      // Step 1: Search for the venue to get its details
      let venueDetails: {
        placeId: string | null;
        name: string;
        address: string;
        phone: string | null;
        website: string | null;
      } = {
        placeId: null,
        name: String(venue),
        address: '',
        phone: null,
        website: null,
      };

      try {
        const searchResult = await _executeImpl(
          supabase,
          'searchPlaces',
          { query: String(venue) },
          tripId,
          userId,
          locationContext,
        );
        if (searchResult.success && searchResult.places?.length > 0) {
          const top = searchResult.places[0];
          venueDetails.placeId = top.placeId;
          venueDetails.name = top.name;
          venueDetails.address = top.address;
        }

        if (venueDetails.placeId) {
          const details = await _executeImpl(
            supabase,
            'getPlaceDetails',
            { placeId: venueDetails.placeId },
            tripId,
            userId,
            locationContext,
          );
          if (details.success) {
            venueDetails.phone = details.phone;
            venueDetails.website = details.website;
          }
        }
      } catch (_e) {
        // Continue with partial data
      }

      // Step 2: If we have a booking URL, browse it for reservation instructions
      let bookingInfo: { analysis: string; relevantLinks: unknown[] } | null = null;
      const targetBookingUrl = bookingUrl || venueDetails.website;
      if (targetBookingUrl) {
        try {
          const browseResult = await _executeImpl(
            supabase,
            'browseWebsite',
            {
              url: targetBookingUrl,
              instruction:
                'Find the reservation/booking page or form. Extract available times, party size limits, and how to complete a reservation. Look for OpenTable, Resy, or other booking platform links.',
            },
            tripId,
            userId,
            locationContext,
          );
          if (browseResult.success) {
            bookingInfo = {
              analysis: browseResult.analysis || '',
              relevantLinks: browseResult.relevantLinks || [],
            };
          }
        } catch (_e) {
          // Browsing failed — that's fine
        }
      }

      // Step 3: Also add to calendar if datetime is provided
      let calendarEvent = null;
      if (datetime) {
        try {
          const calResult = await _executeImpl(
            supabase,
            'addToCalendar',
            {
              title: `Reservation at ${venueDetails.name}`,
              datetime,
              location: venueDetails.address || venueDetails.name,
              notes: `Party of ${partySize || 2}${name ? ` under ${name}` : ''}${specialRequests ? `. ${specialRequests}` : ''}`,
            },
            tripId,
            userId,
            locationContext,
          );
          if (calResult.success) {
            calendarEvent = calResult.event;
          }
        } catch (_e) {
          // Calendar add failed — not blocking
        }
      }

      return {
        success: true,
        venue: venueDetails,
        requestedDatetime: datetime || null,
        partySize: partySize || 2,
        reservationName: name || null,
        contactPhone: phone || venueDetails.phone || null,
        specialRequests: specialRequests || null,
        bookingInfo,
        calendarEvent,
        actionType: 'make_reservation',
        message: `Reservation details gathered for ${venueDetails.name}${bookingInfo ? '. Booking page analyzed — see instructions below.' : venueDetails.phone ? `. Call ${venueDetails.phone} to book.` : '. Visit their website to complete the booking.'}`,
      };
    }

    // ========== DEEP LINK RESOLVER ==========

    case 'getDeepLink': {
      const { entityType, entityId } = args;
      if (!entityType || !entityId) {
        return { error: 'entityType and entityId are required' };
      }

      const SITE_URL = Deno.env.get('SITE_URL') || 'https://chravel.app';
      const validTypes = new Set(['event', 'task', 'poll', 'link', 'payment', 'broadcast']);
      if (!validTypes.has(String(entityType))) {
        return { error: `Invalid entityType. Must be one of: ${[...validTypes].join(', ')}` };
      }

      // Map entity types to their trip tab paths
      const tabMap: Record<string, string> = {
        event: 'calendar',
        task: 'tasks',
        poll: 'polls',
        link: 'explore',
        payment: 'payments',
        broadcast: 'broadcasts',
      };

      const tab = tabMap[String(entityType)] || 'calendar';
      const deepLink = `${SITE_URL}/trip/${tripId}?tab=${tab}&item=${entityId}`;

      return {
        success: true,
        deepLink,
        entityType: String(entityType),
        entityId: String(entityId),
        message: `Deep link generated for ${entityType}`,
      };
    }

    // ========== EXPENSE SETTLEMENT ==========

    case 'settleExpense': {
      const { splitId, amount, method } = args;
      if (!splitId) return { error: 'splitId is required' };
      if (!userId) return { error: 'Authentication required' };

      // Verify the split belongs to this trip
      const { data: split, error: fetchErr } = await supabase
        .from('payment_splits')
        .select('id, payment_message_id, debtor_user_id, amount_owed, is_settled')
        .eq('id', splitId)
        .single();

      if (fetchErr || !split) {
        return { error: 'Payment split not found' };
      }

      if (split.is_settled) {
        return { error: 'This expense has already been settled' };
      }

      // Verify the payment_message belongs to this trip
      const { data: payment } = await supabase
        .from('trip_payment_messages')
        .select('trip_id')
        .eq('id', split.payment_message_id)
        .eq('trip_id', tripId)
        .single();

      if (!payment) {
        return { error: 'Payment not found in this trip' };
      }

      const safeMethod = String(method || 'marked_settled');

      // Settling money is irreversible. Audit + recoverable confirm row -- if the
      // update fails the user still has a pending card. Mirrors addExpense.
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId,
          tool_name: 'settleExpense',
          payload: {
            split_id: String(splitId),
            payment_message_id: split.payment_message_id,
            debtor_user_id: split.debtor_user_id,
            amount_owed: split.amount_owed,
            method: safeMethod,
            created_by: userId,
            trip_id: tripId,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      let updated: any = null;
      const { data, error } = await supabase
        .from('payment_splits')
        .update({ is_settled: true })
        .eq('id', splitId)
        .select()
        .single();
      if (!error && data) {
        updated = data;
        promoted = true;
        await markPendingConfirmed(supabase, pending.id, userId);
      } else if (error) {
        console.warn('[Tool] settleExpense fast-path failed, falling back:', error.message);
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        split: updated,
        method: safeMethod,
        actionType: 'settle_expense',
        message: promoted
          ? `Marked expense of $${split.amount_owed} as settled`
          : `I'd like to mark this $${split.amount_owed} expense as settled. Please confirm in the trip chat.`,
      };
    }

    // ========== PERMISSION EXPLAINER ==========

    case 'explainPermission': {
      const { action } = args;
      if (!action) return { error: 'action is required' };
      if (!userId) return { error: 'Authentication required' };

      // Check user's role in this trip
      const { data: membership } = await supabase
        .from('trip_members')
        .select('role')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .single();

      // Check if user is the trip creator
      const { data: trip } = await supabase
        .from('trips')
        .select('created_by')
        .eq('id', tripId)
        .single();

      const isCreator = trip?.created_by === userId;
      const role = membership?.role || 'none';
      const isMember = !!membership;

      const permissions: Record<
        string,
        { allowed: boolean; reason: string; requiredRole: string }
      > = {
        addToCalendar: {
          allowed: isMember,
          reason: isMember ? 'Trip members can add events' : 'Must be a trip member',
          requiredRole: 'member',
        },
        updateCalendarEvent: {
          allowed: isMember,
          reason: isMember
            ? 'Trip members can update events they created'
            : 'Must be a trip member',
          requiredRole: 'member (own events)',
        },
        deleteCalendarEvent: {
          allowed: isMember,
          reason: isMember
            ? 'Trip members can delete events they created'
            : 'Must be a trip member',
          requiredRole: 'member (own events)',
        },
        emitBulkDeletePreview: {
          allowed: isMember,
          reason: isMember
            ? 'Trip members can preview bulk event deletion'
            : 'Must be a trip member',
          requiredRole: 'member',
        },
        bulkDeleteCalendarEvents: {
          allowed: isMember,
          reason: isMember
            ? 'Trip members can bulk delete events via confirmed preview'
            : 'Must be a trip member',
          requiredRole: 'member',
        },
        createTask: {
          allowed: isMember,
          reason: isMember ? 'Trip members can create tasks' : 'Must be a trip member',
          requiredRole: 'member',
        },
        createPoll: {
          allowed: isMember,
          reason: isMember ? 'Trip members can create polls' : 'Must be a trip member',
          requiredRole: 'member',
        },
        createBroadcast: {
          allowed: isMember,
          reason: isMember ? 'Trip members can send broadcasts' : 'Must be a trip member',
          requiredRole: 'member',
        },
        setBasecamp: {
          allowed: isCreator || role === 'admin',
          reason: isCreator
            ? 'Trip creator can set trip basecamp'
            : role === 'admin'
              ? 'Admins can set trip basecamp'
              : 'Only trip creator or admin can set trip basecamp',
          requiredRole: 'creator or admin',
        },
        setTripHeaderImage: {
          allowed: isCreator || role === 'admin',
          reason: isCreator
            ? 'Trip creator can change the header image'
            : 'Only trip creator or admin can change the header image',
          requiredRole: 'creator or admin',
        },
      };

      const actionKey = String(action);
      const perm = permissions[actionKey];

      return {
        success: true,
        action: actionKey,
        userRole: role,
        isCreator,
        isMember,
        allowed: perm?.allowed ?? isMember,
        reason: perm?.reason ?? (isMember ? 'Allowed as trip member' : 'Must be a trip member'),
        requiredRole: perm?.requiredRole ?? 'member',
        message: perm
          ? `${actionKey}: ${perm.reason}`
          : `${actionKey}: ${isMember ? 'Allowed' : 'Not allowed — not a trip member'}`,
      };
    }

    case 'verify_artifact': {
      const { type, id, idempotency_key } = args;
      let table = '';
      if (type === 'task') table = 'trip_tasks';
      else if (type === 'event') table = 'trip_events';
      else if (type === 'poll') table = 'trip_polls';
      else if (type === 'link' || type === 'place') table = 'trip_links';
      else return { error: `Unknown artifact type: ${type}` };

      let query = supabase.from(table).select('id').eq('trip_id', tripId);
      if (id) query = query.eq('id', id);
      if (idempotency_key) query = query.eq('idempotency_key', idempotency_key);

      const { data, error } = await query.maybeSingle();
      if (error) return { error: error.message };

      return { success: true, exists: !!data, found_id: data?.id || null };
    }

    // ── New Tools (60-tool expansion) ────────────────────────────────────────

    case 'optimizeItinerary': {
      // Nearest-neighbor TSP heuristic using the Distance Matrix API.
      const { locations, startingPoint, mode } = args;
      const locs: string[] = Array.isArray(locations) ? locations.map(String) : [];
      if (locs.length < 2) return { error: 'At least 2 locations are required' };
      if (!GOOGLE_MAPS_API_KEY) return { error: 'Google API key not configured' };

      const start = startingPoint ? String(startingPoint) : locs[0];
      const remaining = startingPoint ? [...locs] : locs.slice(1);
      const travelMode = String(mode || 'driving');

      // Get distance matrix: start vs all remaining, then build greedy route
      const matrixResult = await _executeImpl(
        supabase,
        'getDistanceMatrix',
        { origins: [start, ...remaining], destinations: [...remaining, start], mode: travelMode },
        tripId,
        userId,
        locationContext,
      );
      if (matrixResult.error) return matrixResult;

      // Greedy nearest-neighbor from the start
      const ordered: string[] = [start];
      const unvisited = new Set(remaining);

      // getDistanceMatrix returns { rows: [{ elements: [{ durationSeconds, ... }] }] }
      // origins[0]=start, origins[1..N]=remaining; destinations[0..N-1]=remaining, destinations[N]=start
      const matrixRows: any[] = matrixResult.rows || [];
      let currentIdx = 0; // index into origins array (0 = start)

      while (unvisited.size > 0) {
        let bestDuration = Infinity;
        let bestDest = '';
        for (const loc of unvisited) {
          const destIdx = remaining.indexOf(loc);
          const cell = matrixRows[currentIdx]?.elements?.[destIdx];
          const secs =
            cell?.durationSeconds ?? cell?.duration_seconds ?? cell?.duration?.value ?? Infinity;
          if (secs < bestDuration) {
            bestDuration = secs;
            bestDest = loc;
          }
        }
        if (!bestDest) break;
        ordered.push(bestDest);
        unvisited.delete(bestDest);
        currentIdx = remaining.indexOf(bestDest) + 1; // +1 because origins[0]=start
      }

      return {
        success: true,
        suggestedOrder: ordered,
        mode: travelMode,
        message: `Optimized order for ${ordered.length} stops`,
      };
    }

    case 'detectScheduleConflicts': {
      const { date } = args;
      let query = supabase
        .from('trip_events')
        .select('id, title, start_time, end_time')
        .eq('trip_id', tripId)
        .not('start_time', 'is', null)
        .order('start_time', { ascending: true });

      if (date) {
        const dayStart = new Date(`${date}T00:00:00Z`).toISOString();
        const dayEnd = new Date(`${date}T23:59:59Z`).toISOString();
        query = query.gte('start_time', dayStart).lte('start_time', dayEnd);
      }

      const { data: events, error } = await query.limit(200);
      if (error) return { error: error.message };
      if (!events || events.length === 0) return { success: true, conflicts: [], count: 0 };

      // Full O(n²) interval overlap — adjacent-pair check misses overlaps between
      // non-consecutive events (e.g. A 9-11, B 9:30-12, C 10-10:30 → A/C not adjacent).
      const conflicts: any[] = [];
      const seenPairs = new Set<string>();
      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const a = events[i];
          const b = events[j];
          if (!a.end_time || !b.start_time) continue;
          // Events overlap when one starts before the other ends
          if (
            new Date(b.start_time) < new Date(a.end_time) &&
            new Date(a.start_time) < new Date(b.end_time || b.start_time)
          ) {
            const pairKey = `${a.id}:${b.id}`;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);
            const overlapStart = Math.max(
              new Date(a.start_time).getTime(),
              new Date(b.start_time).getTime(),
            );
            const overlapEnd = Math.min(
              new Date(a.end_time).getTime(),
              new Date(b.end_time || b.start_time).getTime(),
            );
            conflicts.push({
              eventA: { id: a.id, title: a.title, start: a.start_time, end: a.end_time },
              eventB: { id: b.id, title: b.title, start: b.start_time, end: b.end_time },
              overlapMinutes: Math.max(0, Math.round((overlapEnd - overlapStart) / 60000)),
            });
          }
        }
      }

      return {
        success: true,
        conflicts,
        count: conflicts.length,
        message:
          conflicts.length === 0
            ? 'No scheduling conflicts found'
            : `Found ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}`,
      };
    }

    case 'generatePackingList': {
      const { destination, startDate, endDate, activities } = args;
      if (!destination) return { error: 'Destination is required' };

      // Get weather context to improve suggestions
      const weatherResult = await _executeImpl(
        supabase,
        'getWeatherForecast',
        { location: String(destination), date: startDate || undefined },
        tripId,
        userId,
        locationContext,
      );

      const activityList = Array.isArray(activities) ? activities.join(', ') : '';
      const duration =
        startDate && endDate
          ? Math.ceil(
              (new Date(String(endDate)).getTime() - new Date(String(startDate)).getTime()) /
                86400000,
            )
          : null;

      const query = [
        `packing list for ${destination}`,
        duration ? `${duration} day trip` : '',
        activityList ? `activities: ${activityList}` : '',
      ]
        .filter(Boolean)
        .join(', ');

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: `travel packing list ${query}`, count: 3 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        duration: duration ? `${duration} days` : null,
        activities: activityList || null,
        weatherContext: weatherResult.searchResults || [],
        searchResults: searchResult.success ? searchResult.results : [],
        message: `Packing suggestions for ${destination}${duration ? ` (${duration} days)` : ''}`,
      };
    }

    case 'getVisaRequirements': {
      const { destination, passportCountry } = args;
      if (!destination) return { error: 'Destination is required' };

      const q = passportCountry
        ? `visa requirements ${destination} for ${passportCountry} passport citizens 2024`
        : `visa requirements to visit ${destination} 2024`;

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: q, count: 5 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        passportCountry: passportCountry ? String(passportCountry) : null,
        results: searchResult.success ? searchResult.results : [],
        message: `Visa requirements for ${destination}${passportCountry ? ` (${passportCountry} passport)` : ''}`,
      };
    }

    case 'getTravelAdvisories': {
      const { destination } = args;
      if (!destination) return { error: 'Destination is required' };

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        {
          query: `travel advisory warning ${destination} site:travel.state.gov OR site:gov.uk/foreign-travel-advice 2024`,
          count: 5,
        },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        results: searchResult.success ? searchResult.results : [],
        message: `Travel advisories for ${destination}`,
      };
    }

    case 'getLocalPhrases': {
      const { destination, category } = args;
      if (!destination) return { error: 'Destination is required' };

      const cat = category ? String(category) : 'essential travel';
      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        {
          query: `common ${cat} phrases in local language ${destination} with pronunciation guide`,
          count: 3,
        },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        category: cat,
        results: searchResult.success ? searchResult.results : [],
        message: `Local phrases for ${destination} (${cat})`,
      };
    }

    case 'trackFlightStatus': {
      const { flightNumber, date } = args;
      if (!flightNumber) return { error: 'flightNumber is required' };

      const dateStr = date ? String(date) : new Date().toISOString().split('T')[0];
      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        {
          query: `flight status ${flightNumber} ${dateStr} departure arrival delay gate`,
          count: 5,
        },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        flightNumber: String(flightNumber),
        date: dateStr,
        results: searchResult.success ? searchResult.results : [],
        message: `Flight status for ${flightNumber} on ${dateStr}`,
      };
    }

    case 'searchCarRentals': {
      const { location, pickupDate, returnDate, carType } = args;
      if (!location) return { error: 'location is required' };

      const q = [
        `car rental ${location}`,
        pickupDate ? `pickup ${pickupDate}` : '',
        returnDate ? `return ${returnDate}` : '',
        carType ? `${carType} car` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: q, count: 5 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        location: String(location),
        pickupDate: pickupDate ? String(pickupDate) : null,
        returnDate: returnDate ? String(returnDate) : null,
        carType: carType ? String(carType) : null,
        results: searchResult.success ? searchResult.results : [],
        message: `Car rental options near ${location}`,
      };
    }

    case 'searchPublicTransit': {
      const { origin, destination, departureTime } = args;
      if (!origin || !destination) return { error: 'origin and destination are required' };

      // Use Directions API with transit mode
      const directionsResult = await _executeImpl(
        supabase,
        'getDirectionsETA',
        {
          origin: String(origin),
          destination: String(destination),
          mode: 'transit',
          departureTime: departureTime ? String(departureTime) : undefined,
        },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        origin: String(origin),
        destination: String(destination),
        transit: directionsResult,
        message: `Public transit from ${origin} to ${destination}`,
      };
    }

    case 'searchExperiences': {
      const { destination, category, date } = args;
      if (!destination) return { error: 'destination is required' };

      const cat = category ? String(category) : 'tours and activities';
      const q = [
        `${cat} ${destination}`,
        date ? `available ${date}` : '',
        'book tickets experiences',
      ]
        .filter(Boolean)
        .join(' ');

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: q, count: 5 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        category: cat,
        date: date ? String(date) : null,
        results: searchResult.success ? searchResult.results : [],
        message: `${cat} experiences near ${destination}`,
      };
    }

    case 'getLocalEvents': {
      const { destination, startDate, endDate, category } = args;
      if (!destination) return { error: 'destination is required' };

      const cat = category ? String(category) : 'events';
      const dateRange =
        startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `from ${startDate}` : '';

      const q = `${cat} ${destination} ${dateRange} concerts festivals things to do`.trim();
      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: q, count: 5 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        category: cat,
        dateRange: dateRange || null,
        results: searchResult.success ? searchResult.results : [],
        message: `Events in ${destination}${dateRange ? ` (${dateRange})` : ''}`,
      };
    }

    case 'findNearby': {
      const { placeType, near, limit } = args;
      if (!placeType) return { error: 'placeType is required' };

      // Map friendly names to Google Places types
      const typeMap: Record<string, string> = {
        atm: 'atm',
        pharmacy: 'pharmacy',
        hospital: 'hospital',
        supermarket: 'supermarket',
        gas_station: 'gas_station',
        laundry: 'laundry',
        post_office: 'post_office',
        bank: 'bank',
        police: 'police',
      };
      const googleType = typeMap[String(placeType).toLowerCase()] || String(placeType);

      // Resolve "trip hotel" to location context coordinates
      let searchNear = near ? String(near) : undefined;
      if (searchNear === 'trip hotel' && locationContext?.lat && locationContext?.lng) {
        searchNear = undefined; // will rely on nearLat/nearLng below
      }

      const placesResult = await _executeImpl(
        supabase,
        'searchPlaces',
        {
          query: googleType,
          nearLat: !searchNear && locationContext?.lat ? locationContext.lat : undefined,
          nearLng: !searchNear && locationContext?.lng ? locationContext.lng : undefined,
          ...(searchNear ? { query: `${googleType} near ${searchNear}` } : {}),
        },
        tripId,
        userId,
        locationContext,
      );

      const results = placesResult.places || placesResult.results || [];
      const maxResults = Math.min(Number(limit) || 5, 10);

      return {
        success: true,
        placeType: String(placeType),
        places: results.slice(0, maxResults),
        message: `Nearby ${placeType} results`,
      };
    }

    case 'splitTaskAssignments': {
      const { tasks, idempotency_key } = args;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { error: 'tasks array is required and must not be empty' };
      }

      // Insert one pending action per task so each gets individual confirm/deny.
      // Fast-path: if user is authenticated, also write each task to trip_tasks
      // immediately so they appear in the Tasks tab without round-trip.
      const results: any[] = [];
      let promotedCount = 0;
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i] as {
          title: string;
          assignee?: string;
          dueDate?: string;
          notes?: string;
        };
        const taskKey = idempotency_key ? `${idempotency_key}_${i}` : undefined;
        const taskTitle = String(task.title || '').trim();
        if (!taskTitle) continue;

        const { data: pending, error: pendingError } = await supabase
          .from('trip_pending_actions')
          .insert({
            trip_id: tripId,
            user_id: userId || '00000000-0000-0000-0000-000000000000',
            tool_name: 'createTask',
            ...(taskKey ? { tool_call_id: taskKey } : {}),
            payload: {
              title: taskTitle,
              description: task.notes || null,
              creator_id: userId || '',
              due_at: task.dueDate || null,
              assignee_hint: task.assignee || null,
              trip_id: tripId,
            },
            source_type: 'ai_concierge',
          })
          .select('id')
          .single();

        if (pendingError) throw pendingError;

        let promoted = false;
        if (userId) {
          const { data: taskRow, error: realErr } = await supabase
            .from('trip_tasks')
            .insert({
              trip_id: tripId,
              creator_id: userId,
              title: taskTitle,
              description: task.notes || null,
              due_at: task.dueDate || null,
              source_type: 'ai_concierge',
            })
            .select('id')
            .single();
          if (!realErr && taskRow?.id) {
            await supabase
              .from('task_assignments')
              .insert([{ task_id: taskRow.id, user_id: userId }]);
            await supabase
              .from('task_status')
              .insert([{ task_id: taskRow.id, user_id: userId, completed: false }]);
            promoted = true;
            promotedCount += 1;
            await markPendingConfirmed(supabase, pending.id, userId);
          }
        }
        results.push({
          title: task.title,
          assignee: task.assignee,
          pendingActionId: pending.id,
          promoted,
        });
      }

      return {
        success: true,
        pending: promotedCount < results.length,
        promoted: promotedCount === results.length && results.length > 0,
        tasks: results,
        count: results.length,
        message:
          promotedCount === results.length
            ? `Created ${results.length} task${results.length === 1 ? '' : 's'}.`
            : `${results.length} task${results.length === 1 ? '' : 's'} queued for confirmation`,
      };
    }

    case 'getTripStats': {
      // Aggregate spend from payment messages
      const { data: payments, error: payErr } = await supabase
        .from('trip_payment_messages')
        .select('amount, currency, created_at')
        .eq('trip_id', tripId);
      if (payErr) return { error: payErr.message };

      // Activity count from trip events
      const { count: eventCount, error: evtErr } = await supabase
        .from('trip_events')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId);
      if (evtErr) return { error: evtErr.message };

      // Member count
      const { count: memberCount, error: memErr } = await supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId);
      if (memErr) return { error: memErr.message };

      // Trip dates for days-remaining calculation
      const { data: tripData } = await supabase
        .from('trips')
        .select('start_date, end_date, name')
        .eq('id', tripId)
        .maybeSingle();

      const totalSpend = (payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const tripDays =
        tripData?.start_date && tripData?.end_date
          ? Math.ceil(
              (new Date(tripData.end_date).getTime() - new Date(tripData.start_date).getTime()) /
                86400000,
            )
          : null;
      const daysUntilDeparture = tripData?.start_date
        ? Math.ceil((new Date(tripData.start_date).getTime() - Date.now()) / 86400000)
        : null;

      return {
        success: true,
        tripName: tripData?.name || null,
        totalSpend,
        costPerDay: tripDays && tripDays > 0 ? Math.round(totalSpend / tripDays) : null,
        costPerPerson: memberCount && memberCount > 0 ? Math.round(totalSpend / memberCount) : null,
        activityCount: eventCount || 0,
        memberCount: memberCount || 0,
        tripDays,
        daysUntilDeparture,
        paymentCount: (payments || []).length,
        message: `Trip stats for ${tripData?.name || tripId}`,
      };
    }

    case 'shareItinerary': {
      const { format } = args;
      const view = format === 'print' ? 'print' : 'itinerary';
      const appUrl = Deno.env.get('APP_URL') || 'https://app.chravel.app';
      const shareUrl = `${appUrl}/trip/${tripId}?view=${view}&share=1`;

      return {
        success: true,
        shareUrl,
        format: view,
        tripId,
        message: `Shareable itinerary link generated`,
      };
    }

    case 'getEmergencyContacts': {
      const { destination, passportCountry } = args;
      if (!destination) return { error: 'destination is required' };

      const q = passportCountry
        ? `emergency phone numbers ${destination} police ambulance fire ${passportCountry} embassy`
        : `emergency phone numbers ${destination} police ambulance fire tourist helpline`;

      const searchResult = await _executeImpl(
        supabase,
        'searchWeb',
        { query: q, count: 5 },
        tripId,
        userId,
        locationContext,
      );

      return {
        success: true,
        destination: String(destination),
        passportCountry: passportCountry ? String(passportCountry) : null,
        results: searchResult.success ? searchResult.results : [],
        message: `Emergency contacts for ${destination}`,
      };
    }

    // ========== NEW TOOLS (74-TOOL EXPANSION) ==========

    case 'duplicateCalendarEvent': {
      const { eventId, newDate, idempotency_key } = args;
      if (!eventId) return { error: 'eventId is required' };
      if (!newDate) return { error: 'newDate is required' };

      const { data: src, error: fetchErr } = await supabase
        .from('trip_events')
        .select('title, start_time, end_time, location, description, event_category')
        .eq('id', String(eventId))
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !src) return { error: 'Event not found in this trip' };

      const srcStart = new Date(src.start_time);
      const srcEnd = src.end_time ? new Date(src.end_time) : null;
      const durationMs = srcEnd ? srcEnd.getTime() - srcStart.getTime() : 3600000;

      const [year, month, day] = String(newDate).split('-').map(Number);
      const newStart = new Date(srcStart);
      newStart.setFullYear(year, month - 1, day);
      const newEnd = new Date(newStart.getTime() + durationMs);

      const dedupeId = idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'duplicateCalendarEvent',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            source_event_id: String(eventId),
            source_title: src.title,
            new_start_time: newStart.toISOString(),
            new_end_time: newEnd.toISOString(),
            location: src.location || null,
            description: src.description || null,
            event_category: src.event_category || null,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      // ⚡ Fast-path: insert duplicate immediately
      let promoted = false;
      if (userId) {
        const { error: realErr } = await supabase.from('trip_events').insert({
          trip_id: tripId,
          created_by: userId,
          title: src.title,
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          location: src.location || null,
          description: src.description || null,
          event_category: src.event_category || null,
          source_type: 'ai_concierge',
        });
        if (!realErr) {
          promoted = true;
          await markPendingConfirmed(supabase, pending.id, userId);
        } else {
          console.warn('[Tool] duplicateCalendarEvent fast-path failed:', realErr.message);
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'duplicate_calendar_event',
        message: promoted
          ? `Duplicated "${src.title}" to ${newDate}.`
          : `I'd like to duplicate "${src.title}" to ${newDate}. Please confirm in the trip chat.`,
      };
    }

    case 'bulkMarkTasksDone': {
      const { taskIds, filter, idempotency_key } = args;
      let resolvedIds: string[] = Array.isArray(taskIds) ? taskIds.map(String) : [];

      if (resolvedIds.length === 0 && filter) {
        // Resolve IDs from filter keyword
        const filterStr = String(filter).trim();
        const { data: matched } = await supabase
          .from('trip_tasks')
          .select('id, title')
          .eq('trip_id', tripId)
          .eq('completed', false)
          .ilike('title', `%${filterStr}%`);
        resolvedIds = (matched || []).map((t: { id: string }) => t.id);
      }

      if (resolvedIds.length === 0) {
        return { error: 'No matching tasks found to mark done' };
      }

      const dedupeId = idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'bulkMarkTasksDone',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            task_ids: resolvedIds,
            filter_description: filter ? String(filter) : `${resolvedIds.length} tasks`,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      // ⚡ Fast-path: mark tasks complete immediately
      let promoted = false;
      if (userId) {
        const { error: realErr } = await supabase
          .from('trip_tasks')
          .update({ completed: true, completed_at: new Date().toISOString() })
          .in('id', resolvedIds)
          .eq('trip_id', tripId);
        if (!realErr) {
          promoted = true;
          await markPendingConfirmed(supabase, pending.id, userId);
        } else {
          console.warn('[Tool] bulkMarkTasksDone fast-path failed:', realErr.message);
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'bulk_mark_tasks_done',
        taskCount: resolvedIds.length,
        message: promoted
          ? `Marked ${resolvedIds.length} task(s) complete.`
          : `I'd like to mark ${resolvedIds.length} task(s) as complete. Please confirm in the trip chat.`,
      };
    }

    case 'cloneActivity': {
      const { eventId, targetDates, idempotency_key } = args;
      if (!eventId) return { error: 'eventId is required' };
      if (!Array.isArray(targetDates) || targetDates.length === 0) {
        return { error: 'targetDates must be a non-empty array' };
      }

      const { data: src, error: fetchErr } = await supabase
        .from('trip_events')
        .select('title, start_time, end_time, location, description, event_category')
        .eq('id', String(eventId))
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !src) return { error: 'Event not found in this trip' };

      const srcStart = new Date(src.start_time);
      const srcEnd = src.end_time ? new Date(src.end_time) : null;
      const durationMs = srcEnd ? srcEnd.getTime() - srcStart.getTime() : 3600000;

      const clones = targetDates.map((dateStr: string) => {
        const [y, m, d] = String(dateStr).split('-').map(Number);
        const newStart = new Date(srcStart);
        newStart.setFullYear(y, m - 1, d);
        return {
          title: src.title,
          start_time: newStart.toISOString(),
          end_time: new Date(newStart.getTime() + durationMs).toISOString(),
          location: src.location || null,
          description: src.description || null,
          event_category: src.event_category || null,
        };
      });

      const dedupeId = idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'cloneActivity',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: { clones, source_event_id: String(eventId) },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      // ⚡ Fast-path: bulk insert clones immediately
      let promoted = false;
      if (userId) {
        const { error: realErr } = await supabase.from('trip_events').insert(
          clones.map(c => ({
            trip_id: tripId,
            created_by: userId,
            title: c.title,
            start_time: c.start_time,
            end_time: c.end_time,
            location: c.location,
            description: c.description,
            event_category: c.event_category,
            source_type: 'ai_concierge',
          })),
        );
        if (!realErr) {
          promoted = true;
          await markPendingConfirmed(supabase, pending.id, userId);
        } else {
          console.warn('[Tool] cloneActivity fast-path failed:', realErr.message);
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'clone_activity',
        cloneCount: clones.length,
        message: promoted
          ? `Cloned "${src.title}" to ${clones.length} date(s).`
          : `I'd like to clone "${src.title}" to ${clones.length} date(s). Please confirm in the trip chat.`,
      };
    }

    case 'addExpense': {
      const { description, amount, currency, splitParticipants, idempotency_key } = args;
      if (!description) return { error: 'description is required' };
      if (amount == null || Number(amount) <= 0)
        return { error: 'amount must be a positive number' };

      const dedupeId = idempotency_key || null;
      const splitCount =
        Array.isArray(splitParticipants) && splitParticipants.length > 0
          ? splitParticipants.length
          : 1;
      const safeCurrency = currency ? String(currency).toUpperCase() : 'USD';
      const participants = Array.isArray(splitParticipants) ? splitParticipants : [];

      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'addExpense',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            description: String(description),
            amount: Number(amount),
            currency: safeCurrency,
            split_count: splitCount,
            split_participants: participants,
            created_by: userId || null,
            trip_id: tripId,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      // ⚡ Fast-path: write to trip_payment_messages + payment_splits immediately
      let promoted = false;
      if (userId) {
        const { data: paymentRow, error: payErr } = await supabase
          .from('trip_payment_messages')
          .insert({
            trip_id: tripId,
            created_by: userId,
            amount: Number(amount),
            currency: safeCurrency,
            description: String(description),
            split_count: splitCount,
            split_participants: participants,
            payment_methods: [],
          })
          .select('id')
          .single();
        if (!payErr && paymentRow?.id) {
          if (participants.length > 0) {
            const splitAmount = Number(amount) / splitCount;
            await supabase.from('payment_splits').insert(
              participants.map((uid: any) => ({
                payment_message_id: paymentRow.id,
                debtor_user_id: String(uid),
                amount_owed: splitAmount,
              })),
            );
          }
          promoted = true;
          await markPendingConfirmed(supabase, pending.id, userId);
        } else if (payErr) {
          console.warn('[Tool] addExpense fast-path failed, falling back:', payErr.message);
        }
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'add_expense',
        message: promoted
          ? `Logged ${safeCurrency} ${amount} expense for "${description}".`
          : `I'd like to log a ${safeCurrency} ${amount} expense for "${description}". Please confirm in the trip chat.`,
      };
    }

    case 'moveCalendarEvent': {
      const { eventId, newDate, newTime } = args;
      if (!eventId) return { error: 'eventId is required' };
      if (!newDate) return { error: 'newDate is required' };

      const { data: existing, error: fetchErr } = await supabase
        .from('trip_events')
        .select('id, title, start_time, end_time')
        .eq('id', String(eventId))
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) return { error: 'Event not found in this trip' };

      const srcStart = new Date(existing.start_time);
      const srcEnd = existing.end_time ? new Date(existing.end_time) : null;
      const durationMs = srcEnd ? srcEnd.getTime() - srcStart.getTime() : 3600000;

      const [year, month, day] = String(newDate).split('-').map(Number);
      const newStart = new Date(srcStart);
      newStart.setFullYear(year, month - 1, day);

      if (newTime) {
        const [h, m] = String(newTime).split(':').map(Number);
        newStart.setHours(h, m, 0, 0);
      }

      const newEnd = new Date(newStart.getTime() + durationMs);

      const { data, error } = await supabase
        .from('trip_events')
        .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
        .eq('id', String(eventId))
        .eq('trip_id', tripId)
        .select()
        .single();
      if (error) throw error;
      return {
        success: true,
        event: data,
        actionType: 'move_calendar_event',
        message: `Moved "${existing.title}" to ${newDate}${newTime ? ` at ${newTime}` : ''}`,
      };
    }

    case 'closePoll': {
      const { pollId, idempotency_key, tool_call_id } = args;
      if (!pollId) return { error: 'pollId is required' };

      const { data: existing, error: fetchErr } = await supabase
        .from('trip_polls')
        .select('id, question, status')
        .eq('id', String(pollId))
        .eq('trip_id', tripId)
        .single();
      if (fetchErr || !existing) return { error: 'Poll not found in this trip' };
      if (existing.status === 'closed') return { error: 'Poll is already closed' };

      // Buffered confirm-card flow
      const dedupeId = tool_call_id || idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'closePoll',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: { poll_id: String(pollId), question: existing.question },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      let promoted = false;
      let updatedPoll: Record<string, unknown> | null = null;
      const { data, error: writeErr } = await supabase
        .from('trip_polls')
        .update({ status: 'closed' })
        .eq('id', String(pollId))
        .eq('trip_id', tripId)
        .select()
        .single();

      if (!writeErr && data) {
        updatedPoll = data;
        promoted = true;
        await supabase
          .from('trip_pending_actions')
          .update({
            status: 'confirmed',
            resolved_at: new Date().toISOString(),
            resolved_by: userId,
          })
          .eq('id', pending.id)
          .eq('status', 'pending');
      } else if (writeErr) {
        console.warn(
          '[Tool] closePoll fast-path failed, falling back to client confirm:',
          writeErr.message,
        );
      }

      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        poll: updatedPoll,
        actionType: 'close_poll',
        message: promoted
          ? `Closed poll: "${existing.question}"`
          : `I'd like to close the poll "${existing.question}". Please confirm in the trip chat.`,
      };
    }

    case 'getRecentActivity': {
      const limit = Math.min(Number(args.limit || 20), 50);
      const days = Math.min(Number(args.days || 7), 30);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Try trip_activity_log first (rich structured data)
      const { data: activityLog, error: logErr } = await supabase
        .from('trip_activity_log')
        .select('id, action, object_type, object_id, user_id, source_type, metadata, created_at')
        .eq('trip_id', tripId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!logErr && activityLog && activityLog.length > 0) {
        return {
          success: true,
          source: 'activity_log',
          days,
          count: activityLog.length,
          activity: activityLog,
          message: `Found ${activityLog.length} activity item(s) in the last ${days} day(s)`,
        };
      }

      // Fallback: union of recent tasks + events + links
      const [{ data: tasks }, { data: events }, { data: links }] = await Promise.all([
        supabase
          .from('trip_tasks')
          .select('id, title, completed, updated_at')
          .eq('trip_id', tripId)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase
          .from('trip_events')
          .select('id, title, start_time, updated_at')
          .eq('trip_id', tripId)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase
          .from('trip_links')
          .select('id, title, url, category, updated_at')
          .eq('trip_id', tripId)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(10),
      ]);

      const combined = [
        ...(tasks || []).map((t: any) => ({ ...t, type: 'task' })),
        ...(events || []).map((e: any) => ({ ...e, type: 'event' })),
        ...(links || []).map((l: any) => ({ ...l, type: 'link' })),
      ]
        .sort(
          (a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, limit);

      return {
        success: true,
        source: 'union_query',
        days,
        count: combined.length,
        activity: combined,
        message:
          combined.length > 0
            ? `Found ${combined.length} recent change(s) in the last ${days} day(s)`
            : `No activity found in the last ${days} day(s)`,
      };
    }

    case 'getTaskSummary': {
      const { assignee } = args;

      let query = supabase
        .from('trip_tasks')
        .select('id, title, completed, completed_at, due_at, description')
        .eq('trip_id', tripId);

      if (assignee) {
        // assignee is stored as a display name string in trip_tasks
        query = (query as any).ilike('assignee', `%${String(assignee)}%`);
      }

      const { data: tasks, error } = await query;
      if (error) throw error;

      const all = tasks || [];
      const done = all.filter((t: any) => t.completed);
      const overdue = all.filter(
        (t: any) => !t.completed && t.due_at && new Date(t.due_at) < new Date(),
      );
      const todo = all.filter(
        (t: any) => !t.completed && !(t.due_at && new Date(t.due_at) < new Date()),
      );

      return {
        success: true,
        total: all.length,
        done: done.length,
        todo: todo.length,
        overdue: overdue.length,
        tasks: all,
        message: `${all.length} total task(s): ${done.length} done, ${todo.length} to-do, ${overdue.length} overdue`,
      };
    }

    case 'getGroupAvailability': {
      const { date, dayCount } = args;
      if (!date) return { error: 'date is required' };

      const count = Math.min(Number(dayCount || 1), 7);
      const [y, mo, d] = String(date).split('-').map(Number);
      const startDate = new Date(Date.UTC(y, mo - 1, d));
      const endDate = new Date(Date.UTC(y, mo - 1, d + count));

      const { data: events, error } = await supabase
        .from('trip_events')
        .select('id, title, start_time, end_time')
        .eq('trip_id', tripId)
        .gte('start_time', startDate.toISOString())
        .lt('start_time', endDate.toISOString())
        .order('start_time', { ascending: true });
      if (error) throw error;

      // Group events by calendar day and find gaps > 60 min
      const byDay: Record<string, { start: Date; end: Date; title: string }[]> = {};
      for (const ev of events || []) {
        const day = ev.start_time.substring(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push({
          title: ev.title,
          start: new Date(ev.start_time),
          end: ev.end_time
            ? new Date(ev.end_time)
            : new Date(new Date(ev.start_time).getTime() + 3600000),
        });
      }

      const freeWindows: { date: string; from: string; to: string; durationHours: number }[] = [];

      for (let i = 0; i < count; i++) {
        const dayStart = new Date(startDate.getTime() + i * 86400000);
        const dayStr = dayStart.toISOString().substring(0, 10);
        const dayEvents = (byDay[dayStr] || []).sort(
          (a: any, b: any) => a.start.getTime() - b.start.getTime(),
        );

        // Check window from 08:00 to start of first event
        const morningStart = new Date(dayStart);
        morningStart.setUTCHours(8, 0, 0, 0);
        const eveningEnd = new Date(dayStart);
        eveningEnd.setUTCHours(22, 0, 0, 0);

        if (dayEvents.length === 0) {
          freeWindows.push({
            date: dayStr,
            from: '08:00',
            to: '22:00',
            durationHours: 14,
          });
          continue;
        }

        let cursor = morningStart;
        for (const ev of dayEvents) {
          const gapMs = ev.start.getTime() - cursor.getTime();
          if (gapMs >= 3600000) {
            freeWindows.push({
              date: dayStr,
              from: cursor.toISOString().substring(11, 16),
              to: ev.start.toISOString().substring(11, 16),
              durationHours: Math.round(gapMs / 360000) / 10,
            });
          }
          cursor = ev.end.getTime() > cursor.getTime() ? ev.end : cursor;
        }
        // Gap after last event until 22:00
        const afterGap = eveningEnd.getTime() - cursor.getTime();
        if (afterGap >= 3600000) {
          freeWindows.push({
            date: dayStr,
            from: cursor.toISOString().substring(11, 16),
            to: '22:00',
            durationHours: Math.round(afterGap / 360000) / 10,
          });
        }
      }

      return {
        success: true,
        date: String(date),
        dayCount: count,
        freeWindows,
        totalScheduledEvents: (events || []).length,
        message:
          freeWindows.length > 0
            ? `Found ${freeWindows.length} free window(s) over ${count} day(s)`
            : `No free windows over 1 hour found in the requested period`,
      };
    }

    case 'getUpcomingReminders': {
      const limit = Math.min(Number(args.limit || 10), 50);

      const { data: reminders, error } = await (supabase as any)
        .from('trip_pending_actions')
        .select('id, payload, created_at')
        .eq('trip_id', tripId)
        .eq('tool_name', 'addReminder')
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      const now = new Date();
      const upcoming = (reminders || []).filter((r: any) => {
        const remindAt = r.payload?.remind_at;
        return remindAt && new Date(remindAt) > now;
      });

      return {
        success: true,
        count: upcoming.length,
        reminders: upcoming.map((r: any) => ({
          id: r.id,
          message: r.payload?.message,
          remind_at: r.payload?.remind_at,
          entity_type: r.payload?.entity_type,
          entity_id: r.payload?.entity_id,
        })),
        message:
          upcoming.length > 0
            ? `${upcoming.length} upcoming reminder(s) found`
            : 'No upcoming reminders',
      };
    }

    case 'searchTripChats': {
      const { query: chatQuery, limit } = args;
      const searchStr = String(chatQuery || '').trim();
      if (!searchStr) return { error: 'query is required' };

      const resultLimit = Math.min(Number(limit || 20), 50);

      const { data: messages, error } = await supabase
        .from('trip_chat_messages')
        .select('id, content, sender_id, created_at')
        .eq('trip_id', tripId)
        .ilike('content', `%${searchStr}%`)
        .order('created_at', { ascending: false })
        .limit(resultLimit);
      if (error) throw error;

      return {
        success: true,
        query: searchStr,
        count: (messages || []).length,
        messages: messages || [],
        message:
          (messages || []).length > 0
            ? `Found ${messages!.length} message(s) matching "${searchStr}"`
            : `No messages found matching "${searchStr}"`,
      };
    }

    case 'getPollResults': {
      const { pollId } = args;

      let query = supabase
        .from('trip_polls')
        .select('id, question, options, status, total_votes, created_at')
        .eq('trip_id', tripId);

      if (pollId) {
        query = query.eq('id', String(pollId));
      } else {
        query = (query as any).in('status', ['active', 'closed']);
      }

      const { data: polls, error } = await query
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;

      return {
        success: true,
        count: (polls || []).length,
        polls: polls || [],
        message: (polls || []).length > 0 ? `Found ${polls!.length} poll(s)` : 'No polls found',
      };
    }

    case 'getTripLinks': {
      const { category, limit } = args;
      const resultLimit = Math.min(Number(limit || 30), 100);

      let query = supabase
        .from('trip_links')
        .select('id, url, title, description, category, created_at')
        .eq('trip_id', tripId);

      if (category) {
        query = query.ilike('category', `%${String(category)}%`);
      }

      const { data: links, error } = await query
        .order('created_at', { ascending: false })
        .limit(resultLimit);
      if (error) throw error;

      return {
        success: true,
        count: (links || []).length,
        links: links || [],
        message:
          (links || []).length > 0
            ? `Found ${links!.length} saved link(s)${category ? ` in category "${category}"` : ''}`
            : 'No saved links found',
      };
    }

    case 'getTripInfo': {
      const { data: trip, error } = await supabase
        .from('trips')
        .select(
          'id, name, destination, start_date, end_date, description, trip_type, primary_timezone',
        )
        .eq('id', tripId)
        .single();
      if (error) throw error;
      if (!trip) return { error: 'Trip not found' };

      return {
        success: true,
        trip,
        message: `Trip: ${trip.name}${trip.destination ? ` → ${trip.destination}` : ''}`,
      };
    }

    case 'updateTripDetails': {
      const { name, destination, description, startDate, endDate, idempotency_key } = args;

      const updates: Record<string, unknown> = {};
      if (name) updates.name = String(name);
      if (destination !== undefined) updates.destination = destination ? String(destination) : null;
      if (description !== undefined) updates.description = description ? String(description) : null;
      if (startDate) updates.start_date = String(startDate);
      if (endDate) updates.end_date = String(endDate);

      if (Object.keys(updates).length === 0) {
        return { error: 'At least one field to update is required' };
      }

      const dedupeId = idempotency_key || null;
      const { data: pending, error: pendingError } = await supabase
        .from('trip_pending_actions')
        .insert({
          trip_id: tripId,
          user_id: userId || '00000000-0000-0000-0000-000000000000',
          tool_name: 'updateTripDetails',
          ...(dedupeId ? { tool_call_id: dedupeId } : {}),
          payload: {
            ...updates,
            trip_id: tripId,
          },
          source_type: 'ai_concierge',
        })
        .select('id')
        .single();
      if (pendingError) throw pendingError;

      // ⚡ Fast-path: apply update immediately (RLS still enforces edit access)
      let promoted = false;
      if (userId) {
        const { error: realErr } = await supabase.from('trips').update(updates).eq('id', tripId);
        if (!realErr) {
          promoted = true;
          await markPendingConfirmed(supabase, pending.id, userId);
        } else {
          console.warn('[Tool] updateTripDetails fast-path failed:', realErr.message);
        }
      }

      const summary = Object.entries(updates)
        .map(([k, v]) => `${k}: "${v}"`)
        .join(', ');
      return {
        success: true,
        pending: !promoted,
        promoted,
        pendingActionId: pending.id,
        actionType: 'update_trip_details',
        message: promoted
          ? `Updated trip: ${summary}.`
          : `I'd like to update the trip: ${summary}. Please confirm in the trip chat.`,
      };
    }

    default:
      // Loudly surface hallucinated / unregistered tool names. Routine tool calls
      // emit single-line success/error logs from executeFunctionCall; a default-case
      // hit means the model invented a name or a registered tool is missing an
      // executor branch (memory #26 -- five-file sync).
      console.error(
        `[Tool] UNKNOWN_FUNCTION | name=${functionName} | tripId=${tripId} | argsKeys=${Object.keys(args || {}).join(',') || '(none)'}`,
      );
      return { error: `Unknown function: ${functionName}` };
  }
}
