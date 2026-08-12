-- Create usage_counters table for tracking document generation and storage usage
CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  period text NOT NULL, -- 'YYYY-MM' format
  documents_generated integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period)
);

-- Enable RLS
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Company members can view usage counters" ON public.usage_counters
  FOR SELECT USING (public.is_company_member(company_id));

CREATE POLICY "Company admins can update usage counters" ON public.usage_counters
  FOR UPDATE USING (
    public.is_company_member(company_id) AND 
    public.has_company_role(company_id, ARRAY['admin']::public.member_role[])
  );

CREATE POLICY "Company admins can insert usage counters" ON public.usage_counters
  FOR INSERT WITH CHECK (
    public.is_company_member(company_id) AND 
    public.has_company_role(company_id, ARRAY['admin']::public.member_role[])
  );

-- Create index for efficient queries
CREATE INDEX idx_usage_counters_company_period ON public.usage_counters(company_id, period);

-- Create function to update usage counters
CREATE OR REPLACE FUNCTION public.update_usage_counter(
  _company_id uuid,
  _period text,
  _documents_increment integer DEFAULT 0,
  _storage_increment bigint DEFAULT 0
) RETURNS void AS $$
BEGIN
  INSERT INTO public.usage_counters (company_id, period, documents_generated, storage_bytes)
  VALUES (_company_id, _period, _documents_increment, _storage_increment)
  ON CONFLICT (company_id, period) DO UPDATE SET
    documents_generated = public.usage_counters.documents_generated + _documents_increment,
    storage_bytes = public.usage_counters.storage_bytes + _storage_increment,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get current period usage
CREATE OR REPLACE FUNCTION public.get_current_usage(_company_id uuid)
RETURNS TABLE(
  period text,
  documents_generated integer,
  storage_bytes bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.period,
    uc.documents_generated,
    uc.storage_bytes
  FROM public.usage_counters uc
  WHERE uc.company_id = _company_id
    AND uc.period = to_char(now(), 'YYYY-MM')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get usage history
CREATE OR REPLACE FUNCTION public.get_usage_history(_company_id uuid, _months integer DEFAULT 6)
RETURNS TABLE(
  period text,
  documents_generated integer,
  storage_bytes bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.period,
    uc.documents_generated,
    uc.storage_bytes
  FROM public.usage_counters uc
  WHERE uc.company_id = _company_id
    AND uc.period >= to_char(now() - interval '1 month' * _months, 'YYYY-MM')
  ORDER BY uc.period ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;