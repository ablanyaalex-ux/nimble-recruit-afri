CREATE OR REPLACE FUNCTION public.create_workspace(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ws_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (_name, _uid)
  RETURNING id INTO _ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_ws_id, _uid, 'owner');

  RETURN _ws_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;