
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS envelope_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_ip text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_ip text,
  ADD COLUMN IF NOT EXISTS signer_ua text,
  ADD COLUMN IF NOT EXISTS signature_type text,
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS approval_feedback text,
  ADD COLUMN IF NOT EXISTS approval_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_rejected_by uuid;

-- Update the read RPC to return signature + audit fields
DROP FUNCTION IF EXISTS public.get_offer_by_token(text);
CREATE OR REPLACE FUNCTION public.get_offer_by_token(_token text)
 RETURNS TABLE(
   id uuid, status text, salary_amount numeric, salary_currency text, start_date date,
   equity text, bonus text, notes text, sent_at timestamptz, decided_at timestamptz,
   candidate_name text, candidate_email text, job_title text, client_name text,
   workspace_name text, envelope_id uuid, viewed_at timestamptz,
   signed_at timestamptz, signer_name text, signer_ip text, signer_ua text,
   signature_type text, signature_data text,
   internal_approved_at timestamptz, created_at timestamptz,
   recruiter_name text
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.id, o.status, o.salary_amount, o.salary_currency, o.start_date,
         o.equity, o.bonus, o.notes, o.sent_at, o.decided_at,
         c.full_name, c.email, j.title, cl.name, w.name,
         o.envelope_id, o.viewed_at,
         o.signed_at, o.signer_name, o.signer_ip, o.signer_ua,
         o.signature_type, o.signature_data,
         o.internal_approved_at, o.created_at,
         p.display_name
  FROM public.offers o
  JOIN public.candidates c ON c.id = o.candidate_id
  JOIN public.jobs j ON j.id = o.job_id
  JOIN public.clients cl ON cl.id = j.client_id
  JOIN public.workspaces w ON w.id = o.workspace_id
  LEFT JOIN public.profiles p ON p.id = o.created_by
  WHERE o.public_token = _token AND o.status IN ('approved','sent','accepted','declined')
  LIMIT 1;
$function$;

-- Record view (public — safe: only sets viewed_at once, requires valid token, only for live offers)
CREATE OR REPLACE FUNCTION public.record_offer_view(_token text, _ip text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.offers
  SET viewed_at = COALESCE(viewed_at, now()),
      viewed_ip = COALESCE(viewed_ip, _ip)
  WHERE public_token = _token AND status IN ('sent','approved');
END;
$function$;

-- Electronic signature — records signature + moves candidate to hired stage
CREATE OR REPLACE FUNCTION public.sign_offer(
  _token text,
  _signer_name text,
  _signature_type text,
  _signature_data text,
  _signer_ip text DEFAULT NULL,
  _signer_ua text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _offer record;
  _hired_stage text;
BEGIN
  IF _signer_name IS NULL OR btrim(_signer_name) = '' THEN
    RAISE EXCEPTION 'Signer name required';
  END IF;
  IF _signature_type NOT IN ('typed','drawn') THEN
    RAISE EXCEPTION 'Invalid signature type';
  END IF;
  IF _signature_data IS NULL OR length(_signature_data) < 4 THEN
    RAISE EXCEPTION 'Signature required';
  END IF;

  SELECT * INTO _offer FROM public.offers WHERE public_token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF _offer.status <> 'sent' THEN RAISE EXCEPTION 'Offer is no longer pending'; END IF;

  UPDATE public.offers SET
    status = 'accepted',
    decided_at = now(),
    signed_at = now(),
    signer_name = _signer_name,
    signer_ip = _signer_ip,
    signer_ua = _signer_ua,
    signature_type = _signature_type,
    signature_data = _signature_data,
    updated_at = now()
  WHERE id = _offer.id;

  SELECT key INTO _hired_stage FROM public.workspace_pipeline_stages
  WHERE workspace_id = _offer.workspace_id
    AND (key ~* 'hired|accepted|filled' OR label ~* 'hired|accepted|filled')
  ORDER BY position DESC LIMIT 1;
  IF _hired_stage IS NOT NULL THEN
    UPDATE public.job_candidates SET stage = _hired_stage, updated_at = now() WHERE id = _offer.job_candidate_id;
  END IF;

  RETURN jsonb_build_object('status','accepted','envelope_id',_offer.envelope_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_offer_view(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_offer(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_offer_by_token(text) TO anon, authenticated;
