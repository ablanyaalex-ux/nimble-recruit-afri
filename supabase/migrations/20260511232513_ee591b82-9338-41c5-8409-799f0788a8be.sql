CREATE TABLE public.stage_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  stage_id uuid NOT NULL REFERENCES public.workspace_pipeline_stages(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('send_email','slack_notification','create_task')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_triggers_stage ON public.stage_triggers(stage_id);
CREATE INDEX idx_stage_triggers_workspace ON public.stage_triggers(workspace_id);

ALTER TABLE public.stage_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stage triggers" ON public.stage_triggers
FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Insert stage triggers" ON public.stage_triggers
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Update stage triggers" ON public.stage_triggers
FOR UPDATE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Delete stage triggers" ON public.stage_triggers
FOR DELETE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE TRIGGER update_stage_triggers_updated_at
BEFORE UPDATE ON public.stage_triggers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();