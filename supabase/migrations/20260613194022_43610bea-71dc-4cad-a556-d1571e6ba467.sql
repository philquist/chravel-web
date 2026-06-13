-- Tighten profiles SELECT: self-only on raw table. Co-member reads use profiles_public view.
DROP POLICY IF EXISTS "Users can view own profile or shared trip members" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON POLICY "Users can view their own profile" ON public.profiles IS
'Self-only direct access. Sensitive billing/deletion columns must never reach co-members. Cross-user reads must use the profiles_public view, which masks sensitive fields.';