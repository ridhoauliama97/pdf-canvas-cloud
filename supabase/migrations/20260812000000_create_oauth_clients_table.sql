-- Create oauth_clients table for OAuth 2.0 client credentials
CREATE TABLE public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  name text NOT NULL,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT '{read,generate}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

-- RLS policies for oauth_clients
-- Users can only see clients for their company
CREATE POLICY "Users can view their company's OAuth clients"
  ON public.oauth_clients
  FOR SELECT
  TO authenticated
  USING (is_company_member(company_id));

-- Only admins can create OAuth clients
CREATE POLICY "Admins can create OAuth clients"
  ON public.oauth_clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_company_member(company_id) AND
    has_company_role(company_id, ARRAY['admin']::member_role[])
  );

-- Only admins can update OAuth clients
CREATE POLICY "Admins can update their company's OAuth clients"
  ON public.oauth_clients
  FOR UPDATE
  TO authenticated
  USING (
    is_company_member(company_id) AND
    has_company_role(company_id, ARRAY['admin']::member_role[])
  )
  WITH CHECK (is_company_member(company_id));

-- Only admins can delete OAuth clients
CREATE POLICY "Admins can delete their company's OAuth clients"
  ON public.oauth_clients
  FOR DELETE
  TO authenticated
  USING (
    is_company_member(company_id) AND
    has_company_role(company_id, ARRAY['admin']::member_role[])
  );

-- Index for faster lookups by client_id
CREATE INDEX idx_oauth_clients_client_id ON public.oauth_clients(client_id);

-- Index for company lookups
CREATE INDEX idx_oauth_clients_company_id ON public.oauth_clients(company_id);

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_oauth_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_oauth_clients_updated_at
  BEFORE UPDATE ON public.oauth_clients
  FOR EACH ROW
  EXECUTE FUNCTION update_oauth_clients_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_clients TO authenticated;
