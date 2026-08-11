-- Re-grant EXECUTE on RLS helper functions to authenticated role.
-- These SECURITY DEFINER functions are needed by RLS policies to check
-- company membership and roles. Without EXECUTE, the policies silently fail.
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, public.member_role[]) TO authenticated;
