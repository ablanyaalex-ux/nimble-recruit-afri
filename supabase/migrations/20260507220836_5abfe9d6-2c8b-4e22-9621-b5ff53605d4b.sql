
-- 1. Helper: workspace member who is NOT a hiring manager
CREATE OR REPLACE FUNCTION public.is_non_hm_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role <> 'hiring_manager'
  );
$$;

-- 2. Replace jobs SELECT policy so HMs only see assigned jobs
DROP POLICY IF EXISTS "View jobs" ON public.jobs;
CREATE POLICY "View jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.is_non_hm_workspace_member(auth.uid(), workspace_id)
    OR public.is_assigned_hiring_manager(auth.uid(), id)
  );

-- 3. Same fix for clients (HMs only see clients they're linked to)
DROP POLICY IF EXISTS "View clients" ON public.clients;
CREATE POLICY "View clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.is_non_hm_workspace_member(auth.uid(), workspace_id)
    OR public.is_linked_hiring_manager(auth.uid(), id)
  );

-- 4. job_candidates view
DROP POLICY IF EXISTS "View jc" ON public.job_candidates;
CREATE POLICY "View jc" ON public.job_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_candidates.job_id
      AND (
        public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
        OR public.is_assigned_hiring_manager(auth.uid(), j.id)
      )
  ));

-- 5. candidates view
DROP POLICY IF EXISTS "View candidates" ON public.candidates;
CREATE POLICY "View candidates" ON public.candidates
  FOR SELECT TO authenticated
  USING (
    public.is_non_hm_workspace_member(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.job_candidates jc
      WHERE jc.candidate_id = candidates.id
        AND public.is_assigned_hiring_manager(auth.uid(), jc.job_id)
    )
  );

-- 6. candidate_comments view
DROP POLICY IF EXISTS "View comments" ON public.candidate_comments;
CREATE POLICY "View comments" ON public.candidate_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = candidate_comments.job_candidate_id
      AND (
        public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
        OR public.is_assigned_hiring_manager(auth.uid(), j.id)
      )
  ));

-- 7. interview_feedback view
DROP POLICY IF EXISTS "View feedback" ON public.interview_feedback;
CREATE POLICY "View feedback" ON public.interview_feedback
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = interview_feedback.job_candidate_id
      AND (
        public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
        OR public.is_assigned_hiring_manager(auth.uid(), j.id)
      )
  ));

-- 8. job_hiring_managers view
DROP POLICY IF EXISTS "View jhm" ON public.job_hiring_managers;
CREATE POLICY "View jhm" ON public.job_hiring_managers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_hiring_managers.job_id
      AND (
        public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
        OR public.is_assigned_hiring_manager(auth.uid(), j.id)
      )
  ));

-- 9. Anonymisation flag on job_candidates (toggled in Review stage)
ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS anonymized boolean NOT NULL DEFAULT false;
