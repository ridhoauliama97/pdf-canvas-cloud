-- Create audit_log table for tracking all system actions
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  action text NOT NULL, -- 'template.create', 'document.generate', 'api_key.create', etc.
  resource_type text NOT NULL, -- 'template', 'document', 'api_key', etc.
  resource_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: members can read their company's audit logs
CREATE POLICY "audit_log_select_member" ON public.audit_log
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

-- Only system can insert (via server functions using service role)
CREATE POLICY "audit_log_insert_system" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id));

-- Create indexes for efficient queries
CREATE INDEX idx_audit_log_company ON public.audit_log(company_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log(action);
CREATE INDEX idx_audit_log_resource ON public.audit_log(resource_type, resource_id);

-- Create function to query audit logs with pagination
CREATE OR REPLACE FUNCTION public.get_audit_logs(
  _company_id uuid,
  _action_filter text DEFAULT NULL,
  _start_date timestamptz DEFAULT NULL,
  _end_date timestamptz DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  user_id uuid,
  action text,
  resource_type text,
  resource_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz,
  total_count bigint
) AS $$
DECLARE
  _offset integer := (_page - 1) * _page_size;
  _total bigint;
BEGIN
  -- Get total count
  SELECT count(*) INTO _total
  FROM public.audit_log al
  WHERE al.company_id = _company_id
    AND (_action_filter IS NULL OR al.action = _action_filter)
    AND (_start_date IS NULL OR al.created_at >= _start_date)
    AND (_end_date IS NULL OR al.created_at <= _end_date);

  -- Return paginated results with total count
  RETURN QUERY
  SELECT 
    al.id,
    al.company_id,
    al.user_id,
    al.action,
    al.resource_type,
    al.resource_id,
    al.details,
    al.ip_address,
    al.created_at,
    _total as total_count
  FROM public.audit_log al
  WHERE al.company_id = _company_id
    AND (_action_filter IS NULL OR al.action = _action_filter)
    AND (_start_date IS NULL OR al.created_at >= _start_date)
    AND (_end_date IS NULL OR al.created_at <= _end_date)
  ORDER BY al.created_at DESC
  LIMIT _page_size
  OFFSET _offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_audit_logs(uuid, text, timestamptz, timestamptz, integer, integer) TO authenticated;
