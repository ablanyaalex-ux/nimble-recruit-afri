CREATE TABLE public.job_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  approver_id uuid NOT NULL,
  step_order int NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  token text UNIQUE,
  token_expires_at timestamptz,
  decided_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_approval_steps_status_chk CHECK (status IN ('waiting','pending','approved','rejected')),
  CONSTRAINT job_approval_steps_unique_order UNIQUE (job_id, step_order)
);

CREATE INDEX idx_jas_job_order ON public.job_approval_steps(job_id, step_order);
CREATE INDEX idx_jas_token ON public.job_approval_steps(token);

ALTER TABLE public.job_approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View approval steps"
ON public.job_approval_steps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_approval_steps.job_id AND public.is_workspace_member(auth.uid(), j.workspace_id)));

CREATE POLICY "Insert approval steps"
ON public.job_approval_steps FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_approval_steps.job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));

CREATE POLICY "Update approval steps"
ON public.job_approval_steps FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_approval_steps.job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));

CREATE POLICY "Delete approval steps"
ON public.job_approval_steps FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_approval_steps.job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));