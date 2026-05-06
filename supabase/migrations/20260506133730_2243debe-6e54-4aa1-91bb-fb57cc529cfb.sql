-- Restrict hiring managers to only jobs they're explicitly assigned to (via job_hiring_managers),
-- not every job within a client they're linked to.

CREATE OR REPLACE FUNCTION public.is_assigned_hiring_manager(_uid uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_hiring_managers jhm
    JOIN public.client_contacts cc ON cc.id = jhm.contact_id
    WHERE jhm.job_id = _job_id
      AND cc.user_id = _uid
  );
$$;

-- jobs: replace HM client-wide access with per-job assignment
DROP POLICY IF EXISTS "View jobs" ON public.jobs;
CREATE POLICY "View jobs" ON public.jobs
FOR SELECT TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR is_assigned_hiring_manager(auth.uid(), id)
);

-- job_candidates: HMs may only view rows for assigned jobs
DROP POLICY IF EXISTS "View jc" ON public.job_candidates;
CREATE POLICY "View jc" ON public.job_candidates
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_candidates.job_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

-- candidates: HMs may only view candidates linked to assigned jobs
DROP POLICY IF EXISTS "View candidates" ON public.candidates;
CREATE POLICY "View candidates" ON public.candidates
FOR SELECT TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR EXISTS (
    SELECT 1 FROM public.job_candidates jc
    WHERE jc.candidate_id = candidates.id
      AND is_assigned_hiring_manager(auth.uid(), jc.job_id)
  )
);

-- job_hiring_managers visibility for HM (only their own assignments)
DROP POLICY IF EXISTS "View jhm" ON public.job_hiring_managers;
CREATE POLICY "View jhm" ON public.job_hiring_managers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_hiring_managers.job_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

-- candidate_comments / interview_feedback / mentions: tighten HM scope to assigned jobs
DROP POLICY IF EXISTS "View comments" ON public.candidate_comments;
CREATE POLICY "View comments" ON public.candidate_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = candidate_comments.job_candidate_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

DROP POLICY IF EXISTS "Insert comments" ON public.candidate_comments;
CREATE POLICY "Insert comments" ON public.candidate_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = candidate_comments.job_candidate_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

DROP POLICY IF EXISTS "View feedback" ON public.interview_feedback;
CREATE POLICY "View feedback" ON public.interview_feedback
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = interview_feedback.job_candidate_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

DROP POLICY IF EXISTS "Insert feedback" ON public.interview_feedback;
CREATE POLICY "Insert feedback" ON public.interview_feedback
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = interview_feedback.job_candidate_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);

DROP POLICY IF EXISTS "View mentions" ON public.comment_mentions;
CREATE POLICY "View mentions" ON public.comment_mentions
FOR SELECT TO authenticated
USING (
  mentioned_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.candidate_comments c
    JOIN public.job_candidates jc ON jc.id = c.job_candidate_id
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE c.id = comment_mentions.comment_id
      AND (
        is_workspace_member(auth.uid(), j.workspace_id)
        OR is_assigned_hiring_manager(auth.uid(), j.id)
      )
  )
);