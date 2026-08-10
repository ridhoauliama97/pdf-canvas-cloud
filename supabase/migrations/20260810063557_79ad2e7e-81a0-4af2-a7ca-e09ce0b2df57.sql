REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_company_role(uuid, public.member_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, public.member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO authenticated;