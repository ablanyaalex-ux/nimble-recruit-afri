-- Hiring managers should only see jobs they are assigned to, and candidates from Review onward.

CREATE OR REPLACE FUNCTION public.can_view_workspace_all(_uid uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = _uid
      AND wm.workspace_id = _workspace_id
      AND wm.role <> 'hiring_manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_hiring_manager(_uid uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_hiring_managers jhm
    JOIN public.client_contacts cc ON cc.id = jhm.contact_id
    WHERE jhm.job_id = _job_id
      AND cc.user_id = _uid
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_job(_uid uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = _job_id
      AND (
        public.can_view_workspace_all(_uid, j.workspace_id)
        OR public.is_assigned_hiring_manager(_uid, j.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_job_candidate(_uid uuid, _job_candidate_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = _job_candidate_id
      AND (
        public.can_view_workspace_all(_uid, j.workspace_id)
        OR (
          public.is_assigned_hiring_manager(_uid, j.id)
          AND jc.stage NOT IN ('application', 'sourced', 'contacted', 'screened')
        )
      )
  );
$$;

DROP POLICY IF EXISTS "View jobs" ON public.jobs;
CREATE POLICY "View jobs" ON public.jobs FOR SELECT TO authenticated
USING (public.can_view_workspace_all(auth.uid(), workspace_id) OR public.is_assigned_hiring_manager(auth.uid(), id));

DROP POLICY IF EXISTS "View jhm" ON public.job_hiring_managers;
CREATE POLICY "View jhm" ON public.job_hiring_managers FOR SELECT TO authenticated
USING (public.can_view_job(auth.uid(), job_id));

DROP POLICY IF EXISTS "View candidates" ON public.candidates;
CREATE POLICY "View candidates" ON public.candidates FOR SELECT TO authenticated
USING (
  public.can_view_workspace_all(auth.uid(), workspace_id)
  OR EXISTS (
    SELECT 1
    FROM public.job_candidates jc
    WHERE jc.candidate_id = candidates.id
      AND public.can_view_job_candidate(auth.uid(), jc.id)
  )
);

DROP POLICY IF EXISTS "View jc" ON public.job_candidates;
CREATE POLICY "View jc" ON public.job_candidates FOR SELECT TO authenticated
USING (public.can_view_job_candidate(auth.uid(), id));

DROP POLICY IF EXISTS "View comments" ON public.candidate_comments;
CREATE POLICY "View comments" ON public.candidate_comments FOR SELECT TO authenticated
USING (public.can_view_job_candidate(auth.uid(), job_candidate_id));

DROP POLICY IF EXISTS "Insert comments" ON public.candidate_comments;
CREATE POLICY "Insert comments" ON public.candidate_comments FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND public.can_view_job_candidate(auth.uid(), job_candidate_id));

DROP POLICY IF EXISTS "View mentions" ON public.comment_mentions;
CREATE POLICY "View mentions" ON public.comment_mentions FOR SELECT TO authenticated
USING (
  mentioned_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.candidate_comments c
    WHERE c.id = comment_id
      AND public.can_view_job_candidate(auth.uid(), c.job_candidate_id)
  )
);

DROP POLICY IF EXISTS "View feedback" ON public.interview_feedback;
CREATE POLICY "View feedback" ON public.interview_feedback FOR SELECT TO authenticated
USING (public.can_view_job_candidate(auth.uid(), job_candidate_id));

DROP POLICY IF EXISTS "Insert feedback" ON public.interview_feedback;
CREATE POLICY "Insert feedback" ON public.interview_feedback FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND public.can_view_job_candidate(auth.uid(), job_candidate_id));
