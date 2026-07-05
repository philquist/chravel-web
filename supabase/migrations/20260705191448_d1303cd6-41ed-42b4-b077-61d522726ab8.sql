
-- 1. event_qa_questions: require trip membership
DROP POLICY IF EXISTS insert_qa_questions ON public.event_qa_questions;
CREATE POLICY insert_qa_questions ON public.event_qa_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = event_qa_questions.event_id
        AND tm.user_id = auth.uid()
    )
  );

-- 2. campaign_analytics: tie user_id to auth.uid() and validate campaign exists
DROP POLICY IF EXISTS analytics_insert_authenticated ON public.campaign_analytics;
CREATE POLICY analytics_insert_authenticated ON public.campaign_analytics
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_analytics.campaign_id)
  );

-- 3. recommendation_clicks: impression must belong to inserting user
DROP POLICY IF EXISTS recommendation_clicks_insert_authenticated ON public.recommendation_clicks;
CREATE POLICY recommendation_clicks_insert_authenticated ON public.recommendation_clicks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recommendation_impressions ri
      WHERE ri.id = recommendation_clicks.impression_id
        AND ri.user_id = auth.uid()
    )
  );

-- 4. storage: enforce user-scoped subfolder on uploads
DROP POLICY IF EXISTS "Trip members can upload chat media" ON storage.objects;
CREATE POLICY "Trip members can upload chat media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = (storage.foldername(name))[1]
        AND trip_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Trip members can upload trip media" ON storage.objects;
CREATE POLICY "Trip members can upload trip media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trip-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );
