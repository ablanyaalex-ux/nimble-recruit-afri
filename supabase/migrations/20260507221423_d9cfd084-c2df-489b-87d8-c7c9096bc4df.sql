
CREATE OR REPLACE FUNCTION public.can_view_client(_uid uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND (
        public.is_non_hm_workspace_member(_uid, c.workspace_id)
        OR public.is_linked_hiring_manager(_uid, _client_id)
      )
  );
$$;
