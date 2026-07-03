
-- 1. Restrict sensitive billing columns on profiles from authenticated/anon
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, subscription_product_id) ON public.profiles FROM anon, authenticated;

-- 2. Restrict sensitive billing columns on user_entitlements from authenticated/anon
REVOKE SELECT (stripe_customer_id, revenuecat_customer_id) ON public.user_entitlements FROM anon, authenticated;

-- 3. Add UPDATE policy on chat-media storage bucket scoped to uploader
CREATE POLICY "Users can update own chat media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);
