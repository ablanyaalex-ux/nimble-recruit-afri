
-- Offers table
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  job_candidate_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  salary_amount numeric,
  salary_currency text DEFAULT 'USD',
  start_date date,
  equity text,
  bonus text,
  notes text,
  status text NOT NULL DEFAULT 'draft', -- draft, internal_approval, approved, sent, accepted, declined, withdrawn
  internal_approved_by uuid,
  internal_approved_at timestamptz,
  sent_at timestamptz,
  decided_at timestamptz,
  decline_reason text,
  public_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX offers_token_idx ON public.offers(public_token);
CREATE INDEX offers_jc_idx ON public.offers(job_candidate_id);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View offers" ON public.offers FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Insert offers" ON public.offers FOR INSERT TO authenticated
  WITH CHECK (can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Update offers" ON public.offers FOR UPDATE TO authenticated
  USING (can_edit_workspace(auth.uid(), workspace_id) OR is_assigned_hiring_manager(auth.uid(), job_id));

CREATE POLICY "Delete offers" ON public.offers FOR DELETE TO authenticated
  USING (can_edit_workspace(auth.uid(), workspace_id));

-- Public access by token (anon read & update for accept/decline)
CREATE POLICY "Public view offer by token" ON public.offers FOR SELECT TO anon, authenticated
  USING (status IN ('sent','accepted','declined'));

-- Public RPC to fetch offer by token (avoids needing to expose all sent offers via filter)
CREATE OR REPLACE FUNCTION public.get_offer_by_token(_token text)
RETURNS TABLE(
  id uuid, status text, salary_amount numeric, salary_currency text, start_date date,
  equity text, bonus text, notes text, sent_at timestamptz, decided_at timestamptz,
  candidate_name text, job_title text, client_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.status, o.salary_amount, o.salary_currency, o.start_date,
         o.equity, o.bonus, o.notes, o.sent_at, o.decided_at,
         c.full_name, j.title, cl.name
  FROM public.offers o
  JOIN public.candidates c ON c.id = o.candidate_id
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.clients cl ON cl.id = j.client_id
  WHERE o.public_token = _token AND o.status IN ('sent','accepted','declined')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.respond_offer(_token text, _accept boolean, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _offer record;
  _hired_stage text;
BEGIN
  SELECT * INTO _offer FROM public.offers WHERE public_token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF _offer.status <> 'sent' THEN RAISE EXCEPTION 'Offer is no longer pending'; END IF;

  UPDATE public.offers SET
    status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
    decided_at = now(),
    decline_reason = CASE WHEN _accept THEN NULL ELSE _reason END,
    updated_at = now()
  WHERE id = _offer.id;

  IF _accept THEN
    SELECT key INTO _hired_stage FROM public.workspace_pipeline_stages
    WHERE workspace_id = _offer.workspace_id
      AND (key ~* 'hired|accepted|filled' OR label ~* 'hired|accepted|filled')
    ORDER BY position DESC LIMIT 1;
    IF _hired_stage IS NOT NULL THEN
      UPDATE public.job_candidates SET stage = _hired_stage, updated_at = now() WHERE id = _offer.job_candidate_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN _accept THEN 'accepted' ELSE 'declined' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_offer_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_offer(text, boolean, text) TO anon, authenticated;

-- Activity logging trigger for offers
CREATE OR REPLACE FUNCTION public.log_offer_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'offer_generated';
    INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, metadata)
    VALUES (NEW.workspace_id, NEW.job_id, NEW.job_candidate_id, NEW.candidate_id, NEW.created_by, _action,
      jsonb_build_object('offer_id', NEW.id, 'salary', NEW.salary_amount, 'currency', NEW.salary_currency));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _action := CASE NEW.status
      WHEN 'sent' THEN 'offer_sent'
      WHEN 'accepted' THEN 'offer_accepted'
      WHEN 'declined' THEN 'offer_declined'
      WHEN 'approved' THEN 'offer_approved'
      WHEN 'internal_approval' THEN 'offer_submitted_for_approval'
      ELSE NULL END;
    IF _action IS NOT NULL THEN
      INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, metadata)
      VALUES (NEW.workspace_id, NEW.job_id, NEW.job_candidate_id, NEW.candidate_id,
              COALESCE(auth.uid(), NEW.internal_approved_by, NEW.created_by), _action,
              jsonb_build_object('offer_id', NEW.id, 'reason', NEW.decline_reason));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_offer_activity
AFTER INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.log_offer_activity();

-- Allow workspace-level activity_logs INSERTs from server-side functions
-- (existing INSERT policy requires is_workspace_member; the trigger runs as definer so it will use postgres role and bypass RLS — confirm)
-- The trigger function is SECURITY DEFINER so it bypasses RLS.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
