CREATE OR REPLACE FUNCTION public.is_assigned_hiring_manager(_uid uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_hiring_managers jhm
    JOIN public.client_contacts cc ON cc.id = jhm.contact_id
    LEFT JOIN auth.users u ON u.id = _uid
    WHERE jhm.job_id = _job_id
      AND (
        cc.user_id = _uid
        OR (cc.email IS NOT NULL AND u.email IS NOT NULL AND lower(cc.email) = lower(u.email))
      )
  );
$$;