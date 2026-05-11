ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS match_score smallint,
  ADD COLUMN IF NOT EXISTS match_verdict text,
  ADD COLUMN IF NOT EXISTS match_rationale text,
  ADD COLUMN IF NOT EXISTS match_generated_at timestamptz;