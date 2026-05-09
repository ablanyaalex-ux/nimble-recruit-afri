ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS anonymized_resume_summary text;

COMMENT ON COLUMN public.candidates.anonymized_resume_summary IS 'Redacted resume summary used for anonymised hiring-manager review.';