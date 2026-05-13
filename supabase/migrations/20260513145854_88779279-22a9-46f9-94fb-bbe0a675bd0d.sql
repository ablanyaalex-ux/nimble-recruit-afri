
-- Activity logs table
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  job_id uuid,
  job_candidate_id uuid,
  candidate_id uuid,
  actor_id uuid,
  action_type text NOT NULL,
  from_value text,
  to_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_jc ON public.activity_logs(job_candidate_id, created_at DESC);
CREATE INDEX idx_activity_logs_ws ON public.activity_logs(workspace_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activity logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = activity_logs.job_id
      AND (public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
           OR public.is_assigned_hiring_manager(auth.uid(), j.id))
  )
);

CREATE POLICY "Insert activity logs"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- Trigger to auto-log job_candidate updates
CREATE OR REPLACE FUNCTION public.log_job_candidate_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id uuid;
  _actor uuid := auth.uid();
BEGIN
  SELECT workspace_id INTO _workspace_id FROM public.jobs WHERE id = NEW.job_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, to_value)
    VALUES (_workspace_id, NEW.job_id, NEW.id, NEW.candidate_id, COALESCE(_actor, NEW.added_by), 'candidate_added', NEW.stage);
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, from_value, to_value)
    VALUES (_workspace_id, NEW.job_id, NEW.id, NEW.candidate_id, _actor, 'stage_changed', OLD.stage, NEW.stage);
  END IF;

  IF NEW.rejected IS DISTINCT FROM OLD.rejected THEN
    INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, from_value, to_value, metadata)
    VALUES (_workspace_id, NEW.job_id, NEW.id, NEW.candidate_id, COALESCE(_actor, NEW.rejected_by),
            CASE WHEN NEW.rejected THEN 'rejected' ELSE 'unrejected' END,
            OLD.rejected::text, NEW.rejected::text,
            jsonb_build_object('reason', NEW.rejection_reason));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_jc_activity
AFTER INSERT OR UPDATE ON public.job_candidates
FOR EACH ROW EXECUTE FUNCTION public.log_job_candidate_activity();

-- Realtime
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_candidates;
