import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getCorsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async req => {
  const corsHeaders = getCorsHeaders(req);
  const { createOptionsResponse, createErrorResponse, createSecureResponse } =
    await import('../_shared/securityHeaders.ts');

  if (req.method === 'OPTIONS') {
    return createOptionsResponse(req);
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('Authentication required', 401);
    }

    const { messageId, content, tripId } = await req.json();

    if (!messageId || !content || !tripId) {
      return createErrorResponse('Missing required fields', 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { data: membership } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!membership) {
      return createErrorResponse('Trip not found', 404);
    }

    // Extract URLs from message content
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex) || [];

    // Extract media from content (basic image detection)
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
    const videoExtensions = /\.(mp4|avi|mov|wmv|flv|webm)(\?.*)?$/i;
    const audioExtensions = /\.(mp3|wav|flac|aac|ogg)(\?.*)?$/i;
    const docExtensions = /\.(pdf|doc|docx|txt|rtf|xls|xlsx|ppt|pptx)(\?.*)?$/i;

    // Process URLs
    for (const url of urls) {
      const domain = new URL(url).hostname;

      // Determine if it's a media file
      let mediaType = null;
      if (imageExtensions.test(url)) mediaType = 'image';
      else if (videoExtensions.test(url)) mediaType = 'video';
      else if (audioExtensions.test(url)) mediaType = 'audio';
      else if (docExtensions.test(url)) mediaType = 'document';

      if (mediaType) {
        // Insert into media index
        await supabase.from('trip_media_index').insert({
          trip_id: tripId,
          message_id: messageId,
          media_type: mediaType,
          media_url: url,
          filename: url.split('/').pop()?.split('?')[0] || 'Unknown',
          metadata: { source: 'chat' },
        });
      } else {
        // Do not server-fetch arbitrary user-provided URLs here. Link previews
        // are stored without Open Graph metadata to avoid SSRF through service-role
        // edge execution; a future worker may enrich only allowlisted URLs.
        const ogData = { title: '', description: '', image: '' };

        // Insert into link index
        await supabase.from('trip_link_index').insert({
          trip_id: tripId,
          message_id: messageId,
          url: url,
          domain: domain,
          og_title: ogData.title,
          og_description: ogData.description,
          og_image_url: ogData.image,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: { urls: urls.length },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error parsing message:', error);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
