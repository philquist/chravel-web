import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sendFcmV1, toFcmData } from '../_shared/fcmV1.ts';
import { resolveEmailProviderSecrets } from '../_shared/emailDelivery.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? '');

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  const { createOptionsResponse, createErrorResponse, createSecureResponse } =
    await import('../_shared/securityHeaders.ts');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Notification service is not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate the caller via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authenticatedUserId = userData.user.id;
    const userEmail = (userData.user.email || '').toLowerCase();

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action', message: 'Request body must include action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { action: _action, ...payload } = body;

    // Override userId and email in payload with authenticated user from JWT
    const securePayload = { ...payload, userId: authenticatedUserId, userEmail };

    switch (action) {
      case 'send_push':
        return await sendPushNotification(securePayload, corsHeaders);
      case 'send_email':
        return await sendEmailNotification(securePayload, corsHeaders);
      case 'save_token':
        return await savePushToken(securePayload, corsHeaders);
      case 'remove_token':
        return await removePushToken(securePayload, corsHeaders);
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Notification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

async function sendPushNotification(
  { userId, tokens, title, body, data, icon, badge }: any,
  corsHeaders: Record<string, string>,
) {
  const tokenList: string[] = Array.isArray(tokens) ? tokens : [tokens];

  const result = await sendFcmV1(tokenList, {
    notification: { title, body },
    data: data ? toFcmData(data) : undefined,
    webpush: {
      notification: {
        icon: icon || '/favicon.ico',
        badge: badge || '/favicon.ico',
      },
      fcm_options: { link: data?.url || '/' },
    },
  });

  await supabase.from('notification_logs').insert({
    user_id: userId,
    type: 'push',
    title,
    body,
    data,
    success: result.success.length,
    failure: result.failed.length,
    sent_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      success: result.success.length,
      failure: result.failed.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function sendEmailNotification(
  { userId, email, userEmail, subject, content, template }: any,
  corsHeaders: Record<string, string>,
) {
  const recipient = email || userEmail;
  if (!recipient) {
    throw new Error('Email recipient missing from payload/auth context');
  }

  const provider = resolveEmailProviderSecrets({
    RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') || undefined,
    SENDGRID_API_KEY: Deno.env.get('SENDGRID_API_KEY') || undefined,
  });

  if (!provider) {
    throw new Error('No email provider configured (RESEND_API_KEY or SENDGRID_API_KEY)');
  }

  if (provider.provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'support@chravelapp.com',
        to: [recipient],
        subject,
        html: template || `<p>${content}</p>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend error: ${error}`);
    }
  } else {
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: recipient }],
          subject,
        },
      ],
      from: {
        email: Deno.env.get('SENDGRID_FROM_EMAIL') || 'support@chravelapp.com',
        name: 'ChravelApp',
      },
      content: [
        {
          type: 'text/html',
          value: template || `<p>${content}</p>`,
        },
      ],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid error: ${error}`);
    }
  }

  await supabase.from('notification_logs').insert({
    user_id: userId,
    type: 'email',
    title: subject,
    body: content,
    recipient,
    sent_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function savePushToken(
  { userId, token, platform }: any,
  corsHeaders: Record<string, string>,
) {
  const { data, error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: platform || 'web',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,token',
      },
    )
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function removePushToken({ userId, token }: any, corsHeaders: Record<string, string>) {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token);

  if (error) throw error;

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
