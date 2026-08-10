-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TYPE public.member_role AS ENUM ('admin','editor','developer','viewer');
CREATE TYPE public.template_status AS ENUM ('draft','published');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  industry text,
  brand_color text NOT NULL DEFAULT '#F59E0B',
  logo_url text,
  default_font text NOT NULL DEFAULT 'Inter',
  created_by uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- membership helpers (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_company_id uuid, _roles public.member_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = auth.uid() AND m.role = ANY(_roles)
  );
$$;

CREATE POLICY "companies_select_member" ON public.companies FOR SELECT TO authenticated USING (public.is_company_member(id));
CREATE POLICY "companies_update_admin" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_company_role(id, ARRAY['admin']::public.member_role[]))
  WITH CHECK (public.has_company_role(id, ARRAY['admin']::public.member_role[]));

CREATE POLICY "members_select_member" ON public.company_members FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members_insert_admin" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, ARRAY['admin']::public.member_role[]));
CREATE POLICY "members_update_admin" ON public.company_members FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, ARRAY['admin']::public.member_role[]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['admin']::public.member_role[]));
CREATE POLICY "members_delete_admin" ON public.company_members FOR DELETE TO authenticated
  USING (public.has_company_role(company_id, ARRAY['admin']::public.member_role[]));

-- templates
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  doc_type text NOT NULL DEFAULT 'invoice',
  status public.template_status NOT NULL DEFAULT 'draft',
  page_format text NOT NULL DEFAULT 'A4',
  current_version_id uuid,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select_member" ON public.templates FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "templates_insert_editor" ON public.templates FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, ARRAY['admin','editor']::public.member_role[]));
CREATE POLICY "templates_update_editor" ON public.templates FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, ARRAY['admin','editor']::public.member_role[]))
  WITH CHECK (public.has_company_role(company_id, ARRAY['admin','editor']::public.member_role[]));
CREATE POLICY "templates_delete_admin" ON public.templates FOR DELETE TO authenticated
  USING (public.has_company_role(company_id, ARRAY['admin']::public.member_role[]));

CREATE TABLE public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  data_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  page jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT, INSERT ON public.template_versions TO authenticated;
GRANT ALL ON public.template_versions TO service_role;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_select_member" ON public.template_versions FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "versions_insert_editor" ON public.template_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, ARRAY['admin','editor']::public.member_role[]));

ALTER TABLE public.templates
  ADD CONSTRAINT templates_current_version_fk FOREIGN KEY (current_version_id)
  REFERENCES public.template_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_templates_company ON public.templates(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_versions_template ON public.template_versions(template_id);

-- timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- workspace creation helper
CREATE OR REPLACE FUNCTION public.create_workspace(_name text, _industry text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _slug text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _slug := regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g');
  _slug := trim(both '-' from _slug);
  IF _slug = '' THEN _slug := 'workspace'; END IF;
  _slug := _slug || '-' || substr(replace(gen_random_uuid()::text,'-',''), 1, 6);
  INSERT INTO public.companies (name, slug, industry, created_by)
  VALUES (trim(_name), _slug, _industry, _uid)
  RETURNING id INTO _id;
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (_id, _uid, 'admin');
  RETURN _id;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO authenticated;