import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sanitizeErrorForClient, logError } from '../_shared/errorHandling.ts';
import { isSuperAdminEmail } from '../_shared/superAdmins.ts';
import {
  canRestoreArchivedTrip,
  pickPrimaryEntitlementRow,
  resolveEffectiveTripPlan,
} from '../_shared/tripEntitlementPolicy.ts';

const RestoreTripSchema = z.object({
  trip_id: z.string().uuid('Invalid trip_id format'),
});

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = RestoreTripSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.issues[0]?.message || 'Invalid input' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const { trip_id } = parsed.data;

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, created_by, trip_type, is_archived')
      .eq('id', trip_id)
      .maybeSingle();

    if (tripError) throw tripError;
    if (!trip || trip.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!trip.is_archived) {
      return new Response(JSON.stringify({ success: true, already_active: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isSuperAdmin = isSuperAdminEmail(user.email);

    if (!isSuperAdmin && trip.trip_type === 'consumer') {
      const [
        { data: entitlementRows },
        { data: profile },
        { count: activeConsumerCount, error: countError },
      ] = await Promise.all([
        supabase
          .from('user_entitlements')
          .select('plan, status, current_period_end, purchase_type, updated_at')
          .eq('user_id', user.id),
        supabase
          .from('profiles')
          .select('subscription_status, subscription_product_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .eq('is_archived', false)
          .eq('trip_type', 'consumer'),
      ]);

      if (countError) throw countError;

      const entitlement = pickPrimaryEntitlementRow(entitlementRows ?? []);
      const plan = resolveEffectiveTripPlan({
        entitlement: entitlement ?? null,
        legacyProfile: profile ?? null,
      });

      const canRestore = canRestoreArchivedTrip({
        plan,
        activeConsumerCount: activeConsumerCount || 0,
      });

      if (!canRestore) {
        return new Response(
          JSON.stringify({
            error: 'TRIP_LIMIT_REACHED',
            message: 'Free plan supports up to 3 active consumer trips.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    const { error: restoreError } = await supabase
      .from('trips')
      .update({ is_archived: false })
      .eq('id', trip_id)
      .eq('created_by', user.id)
      .eq('is_archived', true);

    if (restoreError) throw restoreError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logError('RESTORE_TRIP', error);
    return new Response(JSON.stringify({ error: sanitizeErrorForClient(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
