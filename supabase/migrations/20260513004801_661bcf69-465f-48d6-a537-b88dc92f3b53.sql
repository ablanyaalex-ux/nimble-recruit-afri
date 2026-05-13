-- Allow assigned hiring managers to progress or reject candidates that are in the 'reviewed' stage.
CREATE POLICY "HM update jc in reviewed"
ON public.job_candidates
FOR UPDATE
TO authenticated
USING (
  stage = 'reviewed'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_candidates.job_id
      AND public.is_assigned_hiring_manager(auth.uid(), j.id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_candidates.job_id
      AND public.is_assigned_hiring_manager(auth.uid(), j.id)
  )
);