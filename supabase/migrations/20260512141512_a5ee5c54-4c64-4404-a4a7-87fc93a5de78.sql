
-- Phase 1: Templates
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('email','job_description','offer_letter')),
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View templates" ON public.templates FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert templates" ON public.templates FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Update templates" ON public.templates FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Delete templates" ON public.templates FOR DELETE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_templates_workspace ON public.templates(workspace_id, type);

-- Phase 2: Job Approvals
ALTER TABLE public.jobs
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft','pending','approved','rejected')),
  ADD COLUMN approved_by uuid,
  ADD COLUMN approval_requested_from uuid,
  ADD COLUMN approval_decided_at timestamptz,
  ADD COLUMN approval_note text;

-- Phase 3: Outbound email queue
CREATE TABLE public.outbound_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  candidate_id uuid,
  job_candidate_id uuid,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outbound_email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View queue" ON public.outbound_email_queue FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert queue" ON public.outbound_email_queue FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Update queue" ON public.outbound_email_queue FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Delete queue" ON public.outbound_email_queue FOR DELETE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE INDEX idx_queue_status_sched ON public.outbound_email_queue(status, scheduled_at);

-- Phase 4: Job application questions
CREATE TABLE public.job_application_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  question_text text NOT NULL,
  options text[],
  is_knockout boolean NOT NULL DEFAULT false,
  fail_value text,
  rejection_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_application_questions ENABLE ROW LEVEL SECURITY;
-- Public can read questions for approved + open jobs (for the public form)
CREATE POLICY "Public view questions" ON public.job_application_questions FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.approval_status = 'approved' AND j.status = 'open'));
CREATE POLICY "Manage questions" ON public.job_application_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));
CREATE TRIGGER jaq_updated_at BEFORE UPDATE ON public.job_application_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 4: Stage triggers extension
ALTER TABLE public.stage_triggers
  ADD COLUMN template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN delay_minutes int NOT NULL DEFAULT 0;
