-- Invites table
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'recruiter',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid
);

CREATE INDEX idx_workspace_invites_workspace ON public.workspace_invites(workspace_id);
CREATE INDEX idx_workspace_invites_email ON public.workspace_invites(lower(email));
CREATE UNIQUE INDEX uniq_pending_invite_per_email
  ON public.workspace_invites(workspace_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Owners manage invites for their workspace
CREATE POLICY "Owners view workspace invites"
  ON public.workspace_invites FOR SELECT
  TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

CREATE POLICY "Owners create invites"
  ON public.workspace_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_workspace_role(auth.uid(), workspace_id, 'owner')
    AND invited_by = auth.uid()
  );

CREATE POLICY "Owners update invites"
  ON public.workspace_invites FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

CREATE POLICY "Owners delete invites"
  ON public.workspace_invites FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

-- RPC: lookup invite by token (no auth required for preview info)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  email text,
  role public.workspace_role,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.workspace_id, w.name, i.email, i.role, i.status, i.expires_at
  FROM public.workspace_invites i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- RPC: accept invite (must be authenticated; email must match auth user's email)
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _user_email text;
  _inv record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = _uid;

  SELECT * INTO _inv FROM public.workspace_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF _inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is no longer valid';
  END IF;

  IF _inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(_inv.email) <> lower(_user_email) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_inv.workspace_id, _uid, _inv.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.workspace_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = _uid
  WHERE id = _inv.id;

  RETURN _inv.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;