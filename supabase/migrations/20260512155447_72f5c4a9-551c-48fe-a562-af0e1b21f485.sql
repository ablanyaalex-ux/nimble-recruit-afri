
-- Extend jobs with competencies
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS interview_competencies jsonb NOT NULL DEFAULT '[]'::jsonb;

-- interviewer_availability
CREATE TABLE public.interviewer_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  buffer_minutes integer NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interviewer_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View availability" ON public.interviewer_availability FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert own availability" ON public.interviewer_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Update own availability" ON public.interviewer_availability FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Delete own availability" ON public.interviewer_availability FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_interviewer_availability_updated_at
  BEFORE UPDATE ON public.interviewer_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- interview_schedules
CREATE TABLE public.interview_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_candidate_id uuid NOT NULL,
  stage_id uuid,
  interviewer_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending_scheduling' CHECK (status IN ('pending_scheduling','scheduled','completed','cancelled')),
  scheduled_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 45,
  schedule_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View interview_schedules" ON public.interview_schedules FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert interview_schedules" ON public.interview_schedules FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Update interview_schedules" ON public.interview_schedules FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Delete interview_schedules" ON public.interview_schedules FOR DELETE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE TRIGGER update_interview_schedules_updated_at
  BEFORE UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- interview_scorecards
CREATE TABLE public.interview_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interview_schedules(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL,
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_recommendation text CHECK (overall_recommendation IN ('strong_hire','hire','no_hire','strong_no_hire')),
  notes text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, interviewer_id)
);
ALTER TABLE public.interview_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scorecards" ON public.interview_scorecards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Insert scorecards" ON public.interview_scorecards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)));
CREATE POLICY "Update own scorecard" ON public.interview_scorecards FOR UPDATE TO authenticated
  USING (interviewer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)));
CREATE POLICY "Delete scorecards" ON public.interview_scorecards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)));

CREATE TRIGGER update_interview_scorecards_updated_at
  BEFORE UPDATE ON public.interview_scorecards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- interview_recordings
CREATE TABLE public.interview_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interview_schedules(id) ON DELETE CASCADE,
  transcript text,
  ai_summary jsonb,
  video_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interview_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View recordings" ON public.interview_recordings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Insert recordings" ON public.interview_recordings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)) AND created_by = auth.uid());
CREATE POLICY "Update recordings" ON public.interview_recordings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)));
CREATE POLICY "Delete recordings" ON public.interview_recordings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_schedules s WHERE s.id = interview_id AND public.can_edit_workspace(auth.uid(), s.workspace_id)));

CREATE TRIGGER update_interview_recordings_updated_at
  BEFORE UPDATE ON public.interview_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_interview_schedules_workspace ON public.interview_schedules(workspace_id);
CREATE INDEX idx_interview_schedules_jc ON public.interview_schedules(job_candidate_id);
CREATE INDEX idx_interview_schedules_token ON public.interview_schedules(schedule_token);
CREATE INDEX idx_availability_user ON public.interviewer_availability(user_id);
