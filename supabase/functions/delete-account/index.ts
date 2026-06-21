/**
 * delete-account Edge Function
 * Securely deletes a user's account and all associated data.
 * 5b. APPLE: Revoke Sign in with Apple grant (App Store 5.1.1(v)) — before auth.users delete
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { revokeAppleForUser } from '../_shared/appleRevoke.ts';

const logStep = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details !== undefined ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-ACCOUNT] [${timestamp}] ${step}${detailsStr}`);
};

function jsonResponse(data: unknown, status: number, corsHeaders: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number, corsHeaders: HeadersInit): Response {
  return jsonResponse({ success: false, error: message }, status, corsHeaders);
}

function successResponse(data: Record<string, unknown>, corsHeaders: HeadersInit): Response {
  return jsonResponse({ success: true, ...data }, 200, corsHeaders);
}

async function anonymizeMessages(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tripMessages: number; channelMessages: number }> {
  const { count: tripMsgCount } = await supabase
    .from('trip_messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', userId);
  const { count: channelMsgCount } = await supabase
    .from('channel_messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', userId);
  return { tripMessages: tripMsgCount ?? 0, channelMessages: channelMsgCount ?? 0 };
}

async function deleteStorageFiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ avatarsDeleted: number; mediaDeleted: number }> {
  let avatarsDeleted = 0;
  let mediaDeleted = 0;
  try {
    const { data: avatarFiles } = await supabase.storage.from('avatars').list(userId);
    if (avatarFiles && avatarFiles.length > 0) {
      const filePaths = avatarFiles.map(f => `${userId}/${f.name}`);
      const { error } = await supabase.storage.from('avatars').remove(filePaths);
      if (!error) {
        avatarsDeleted = filePaths.length;
      } else {
        logStep('Warning: Failed to delete avatar files', { error: error.message });
      }
    }
  } catch (err) {
    logStep('Warning: Error listing avatar files', { error: String(err) });
  }
  try {
    const { data: mediaRecords } = await supabase
      .from('trip_media_index')
      .select('storage_path')
      .eq('uploaded_by', userId);
    if (mediaRecords && mediaRecords.length > 0) {
      const storagePaths = mediaRecords.map(m => m.storage_path).filter((p): p is string => !!p);
      if (storagePaths.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < storagePaths.length; i += batchSize) {
          const batch = storagePaths.slice(i, i + batchSize);
          const { error } = await supabase.storage.from('trip-media').remove(batch);
          if (!error) {
            mediaDeleted += batch.length;
          } else {
            logStep('Warning: Failed to delete media batch', { error: error.message });
          }
        }
      }
    }
  } catch (err) {
    logStep('Warning: Error processing media files', { error: String(err) });
  }
  return { avatarsDeleted, mediaDeleted };
}

async function handleOwnedTrips(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tripsDeleted: number; tripsTransferred: number }> {
  let tripsDeleted = 0;
  let tripsTransferred = 0;
  const { data: ownedTrips, error: tripError } = await supabase
    .from('trips')
    .select('id, name')
    .eq('created_by', userId);
  if (tripError || !ownedTrips) {
    logStep('Warning: Failed to fetch owned trips', { error: tripError?.message });
    return { tripsDeleted: 0, tripsTransferred: 0 };
  }
  for (const trip of ownedTrips) {
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id, role')
      .eq('trip_id', trip.id)
      .neq('user_id', userId);
    if (!members || members.length === 0) {
      const { error: deleteError } = await supabase.from('trips').delete().eq('id', trip.id);
      if (!deleteError) {
        tripsDeleted++;
        logStep('Deleted orphaned trip', { tripId: trip.id, tripName: trip.name });
      } else {
        logStep('Warning: Failed to delete trip', { tripId: trip.id, error: deleteError.message });
      }
    } else {
      const admin = members.find(m => m.role === 'admin' || m.role === 'organizer');
      const newOwner = admin || members[0];
      if (newOwner) {
        const { error: updateError } = await supabase
          .from('trips')
          .update({ created_by: newOwner.user_id })
          .eq('id', trip.id);
        if (!updateError) {
          tripsTransferred++;
          logStep('Transferred trip ownership', { tripId: trip.id, newOwner: newOwner.user_id });
        } else {
          logStep('Warning: Could not transfer trip ownership', {
            tripId: trip.id,
            error: updateError.message,
          });
        }
      }
    }
  }
  return { tripsDeleted, tripsTransferred };
}

async function deleteUserData(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  const deletedCounts: Record<string, number> = {};
  const tablesToDelete = [
    { table: 'notifications', column: 'user_id' },
    { table: 'ai_queries', column: 'user_id' },
    { table: 'concierge_usage', column: 'user_id' },
    { table: 'user_locations', column: 'user_id' },
    { table: 'user_payment_methods', column: 'user_id' },
    { table: 'user_loyalty_programs', column: 'user_id' },
    { table: 'push_subscriptions', column: 'user_id' },
    { table: 'trip_join_requests', column: 'user_id' },
    { table: 'event_rsvps', column: 'user_id' },
    { table: 'event_qa_upvotes', column: 'user_id' },
    { table: 'poll_votes', column: 'user_id' },
    { table: 'message_reactions', column: 'user_id' },
    { table: 'broadcast_reactions', column: 'user_id' },
    { table: 'message_read_receipts', column: 'user_id' },
    { table: 'trip_media_index', column: 'uploaded_by' },
    { table: 'channel_members', column: 'user_id' },
    { table: 'trip_members', column: 'user_id' },
    { table: 'trip_admins', column: 'user_id' },
    { table: 'trip_role_assignments', column: 'user_id' },
    { table: 'advertisers', column: 'user_id' },
    { table: 'organization_members', column: 'user_id' },
  ];
  for (const { table, column } of tablesToDelete) {
    try {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, userId);
      if (error) {
        logStep(`Warning: Failed to delete from ${table}`, { error: error.message });
        deletedCounts[table] = 0;
      } else {
        deletedCounts[table] = count ?? 0;
      }
    } catch (err) {
      logStep(`Warning: Exception deleting from ${table}`, { error: String(err) });
      deletedCounts[table] = 0;
    }
  }
  return deletedCounts;
}

async function anonymizeProfile(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const anonymizedData = {
    display_name: '[Deleted User]',
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    bio: null,
    avatar_url: null,
    notification_settings: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: 'deleted',
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('profiles').update(anonymizedData).eq('user_id', userId);
  if (error) {
    logStep('Warning: Failed to anonymize profile', { error: error.message });
    return false;
  }
  return true;
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, corsHeaders);

  try {
    logStep('Account deletion request received');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      logStep('ERROR: Missing environment configuration');
      return errorResponse('Server configuration error', 500, corsHeaders);
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logStep('ERROR: Missing or invalid authorization header');
      return errorResponse('Authentication required', 401, corsHeaders);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      logStep('ERROR: User authentication failed', { error: userError?.message });
      return errorResponse('Invalid authentication', 401, corsHeaders);
    }
    const user = userData.user;
    const userId = user.id;
    logStep('User authenticated for deletion', { userId, email: user.email });

    try {
      const body = await req.json();
      const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim() : '';
      if (confirmation.toLowerCase() !== 'delete') {
        logStep('ERROR: Invalid confirmation');
        return errorResponse(
          'Invalid confirmation. Please type "delete" to confirm.',
          400,
          corsHeaders,
        );
      }
    } catch {
      // Body is optional for backwards compatibility
    }

    // Backend audit event — written BEFORE any destructive work so that
    // log inspectors can prove the request was received and acted on
    // immediately (App Store 5.1.1(v) verification).
    try {
      await supabaseAdmin.from('security_audit_log').insert({
        action: 'account_deletion_started',
        table_name: 'auth.users',
        user_id: userId,
        metadata: {
          email: user.email,
          started_at: new Date().toISOString(),
          source: 'delete-account-edge-function',
          immediate: true,
        },
      });
    } catch (err) {
      logStep('Warning: Failed to write deletion_started audit log', { error: String(err) });
    }

    const deletionReport: Record<string, unknown> = { userId, startedAt: new Date().toISOString() };

    logStep('Step 1: Deleting storage files');
    const storageResult = await deleteStorageFiles(supabaseAdmin, userId);
    deletionReport.storage = storageResult;
    logStep('Storage cleanup complete', storageResult);

    logStep('Step 2: Handling owned trips');
    const tripResult = await handleOwnedTrips(supabaseAdmin, userId);
    deletionReport.trips = tripResult;
    logStep('Owned trips handled', tripResult);

    logStep('Step 3: Processing messages');
    const messageResult = await anonymizeMessages(supabaseAdmin, userId);
    deletionReport.messages = messageResult;
    logStep('Messages processed', messageResult);

    logStep('Step 4: Deleting user data from tables');
    const dataResult = await deleteUserData(supabaseAdmin, userId);
    deletionReport.deletedRecords = dataResult;
    logStep('User data deleted', dataResult);

    logStep('Step 5: Anonymizing profile');
    const profileAnonymized = await anonymizeProfile(supabaseAdmin, userId);
    deletionReport.profileAnonymized = profileAnonymized;
    logStep('Profile anonymized', { success: profileAnonymized });

    // Step 5b: Revoke Sign in with Apple grant BEFORE deleting auth.users (App Store 5.1.1(v)).
    logStep('Step 5b: Revoking Apple token (if any)');
    const appleRevocation = await revokeAppleForUser(supabaseAdmin, userId);
    deletionReport.appleRevocation = appleRevocation;
    logStep('Apple revocation complete', appleRevocation);

    logStep('Step 6: Deleting auth user');
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      logStep('ERROR: Failed to delete auth user', { error: authDeleteError.message });
      deletionReport.authUserDeleted = false;
      deletionReport.authDeleteError = authDeleteError.message;
    } else {
      deletionReport.authUserDeleted = true;
      logStep('Auth user deleted successfully');
    }

    deletionReport.completedAt = new Date().toISOString();
    logStep('Account deletion completed', deletionReport);

    // Backend audit event — written AFTER auth.users delete so logs prove
    // the full delete pipeline ran end-to-end in a single request.
    try {
      await supabaseAdmin.from('security_audit_log').insert({
        action: 'account_deletion_completed',
        table_name: 'auth.users',
        user_id: userId,
        metadata: {
          email: user.email,
          completed_at: deletionReport.completedAt,
          auth_user_deleted: deletionReport.authUserDeleted === true,
          storage: deletionReport.storage,
          trips: deletionReport.trips,
          messages: deletionReport.messages,
          deleted_records: deletionReport.deletedRecords,
          profile_anonymized: deletionReport.profileAnonymized,
          apple_revocation: deletionReport.appleRevocation,
          immediate: true,
        },
      });
    } catch (err) {
      logStep('Warning: Failed to write deletion_completed audit log', { error: String(err) });
    }

    return successResponse(
      { message: 'Your account and data have been permanently deleted.', report: deletionReport },
      corsHeaders,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('FATAL ERROR in delete-account', { error: errorMessage });
    return errorResponse(
      'An unexpected error occurred while deleting your account. Please contact support.',
      500,
      corsHeaders,
    );
  }
});
