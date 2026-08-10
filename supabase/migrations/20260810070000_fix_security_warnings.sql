-- 1. Storage bucket + RLS policies
--    Create the bucket if it doesn't already exist (idempotent).
INSERT INTO
    storage.buckets
  (id, name, public)
VALUES
  (
    'reportflow-bucket',
    'reportflow-bucket',
    false
    )
ON CONFLICT
(id) DO NOTHING;

-- Helper: the requesting user belongs to the company that owns the file.
-- File path convention: {company_id}/...
CREATE OR REPLACE FUNCTION public.user_owns_storage_path
(_bucket_id text, _path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path
= public AS $$
SELECT EXISTS
(
    SELECT 1
FROM public.company_members m
WHERE m.user_id = auth.uid()
  AND m.company_id = (
        regexp_replace(_path, '^([^/]+)/.*', '\1')
      )
::uuid
  );
$$;

-- Revoke direct EXECUTE so authenticated callers cannot invoke this helper outside RLS.
REVOKE ALL ON FUNCTION public.user_owns_storage_path
(text, text)
FROM PUBLIC, anon, authenticated;
-- RLS policies still run as the function owner, so the function is reachable from policy checks.

-- SELECT: members of the owning company can read.
CREATE POLICY "storage_select_member" ON storage.objects FOR
SELECT TO authenticated
USING
(
        bucket_id = 'reportflow-bucket'
        AND public.user_owns_storage_path
(bucket_id, name)
    );

-- INSERT: members of the owning company can upload.
CREATE POLICY "storage_insert_member" ON storage.objects FOR
INSERT
    TO authenticated
WITH
    CHECK (
bucket_id
=
'reportflow-bucket'
AND public.user_owns_storage_path
(bucket_id, name)
    );

-- UPDATE: members of the owning company can update.
CREATE POLICY "storage_update_member" ON storage.objects FOR
UPDATE TO authenticated USING (
    bucket_id = 'reportflow-bucket'
  AND public.user_owns_storage_path (bucket_id, name)
)
WITH
    CHECK
(
        bucket_id = 'reportflow-bucket'
        AND public.user_owns_storage_path
(bucket_id, name)
    );

-- DELETE: only admins of the owning company can delete.
CREATE POLICY "storage_delete_admin"
  ON storage.objects
  FOR
DELETE TO authenticated
  USING (
    bucket_id = 'reportflow-bucket'
  AND public.has_company_role(
      (regexp_replace(name, '^([^/]+)/.*', '\1'))::uuid,
      ARRAY['admin']::public.member_role[]
)
  );

-- 2. Companies INSERT policy — any authenticated user can create a company,
--    and is automatically set as the owner via the create_workspace function.
--    This policy allows direct INSERT (e.g. from the API) while tying
--    created_by to the authenticated user.
CREATE POLICY "companies_insert_authenticated" ON public.companies FOR
INSERT
    TO authenticated
WITH
    CHECK (
created_by
=
auth
.uid
());

-- 3. SECURITY DEFINER helper functions — revoke direct EXECUTE from
--    authenticated users so they cannot be called outside RLS policies.
--    RLS policies still invoke them as the function owner (bypassing RLS),
--    which is the intended purpose.
REVOKE ALL ON FUNCTION public.is_company_member
(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_company_role
(uuid, public.member_role[]) FROM PUBLIC, anon, authenticated;

-- create_workspace is a legitimate SECURITY DEFINER function that authenticated
-- users must call directly. It already validates auth.uid() internally, so we
-- re-grant EXECUTE only for this one.
GRANT
EXECUTE ON FUNCTION public.create_workspace
(text, text) TO authenticated;