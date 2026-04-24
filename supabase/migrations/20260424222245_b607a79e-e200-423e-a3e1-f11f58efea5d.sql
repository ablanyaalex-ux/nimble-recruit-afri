ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS resume_summary text,
  ADD COLUMN IF NOT EXISTS resume_summary_generated_at timestamptz;

ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_job_candidates_rejected ON public.job_candidates(job_id, rejected);