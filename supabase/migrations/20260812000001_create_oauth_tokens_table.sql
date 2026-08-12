-- Create oauth_tokens table for OAuth 2.0 access tokens
CREATE TABLE public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  access_token_hash text NOT NULL,
  refresh_token_hash text,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies for oauth_tokens
-- Users can only see tokens for their company
CREATE POLICY "Users can view their company's OAuth tokens"
  ON public.oauth_tokens
  FOR SELECT
  TO authenticated
  USING (is_company_member(company_id));

-- Service role can manage all tokens (for token operations)
CREATE POLICY "Service role can manage OAuth tokens"
  ON public.oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for token lookups by access_token_hash
CREATE INDEX idx_oauth_tokens_access_token_hash ON public.oauth_tokens(access_token_hash);

-- Index for client lookups
CREATE INDEX idx_oauth_tokens_client_id ON public.oauth_tokens(client_id);

-- Index for user lookups
CREATE INDEX idx_oauth_tokens_user_id ON public.oauth_tokens(user_id);

-- Index for company lookups
CREATE INDEX idx_oauth_tokens_company_id ON public.oauth_tokens(company_id);

-- Index for expiration cleanup
CREATE INDEX idx_oauth_tokens_expires_at ON public.oauth_tokens(expires_at);

-- Grant permissions
GRANT SELECT ON public.oauth_tokens TO authenticated;
GRANT ALL ON public.oauth_tokens TO service_role;
