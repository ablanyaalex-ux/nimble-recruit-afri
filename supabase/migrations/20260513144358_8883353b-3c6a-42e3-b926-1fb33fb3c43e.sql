-- Marketplace fields on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS marketplace_status text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS marketplace_category text,
  ADD COLUMN IF NOT EXISTS marketplace_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_summary text,
  ADD COLUMN IF NOT EXISTS remote_policy text;

CREATE INDEX IF NOT EXISTS idx_jobs_marketplace_public
  ON public.jobs (marketplace_status, marketplace_published_at DESC)
  WHERE marketplace_status = 'public';

-- Allow anonymous users to view public marketplace jobs
DROP POLICY IF EXISTS "Public view marketplace jobs" ON public.jobs;
CREATE POLICY "Public view marketplace jobs"
ON public.jobs FOR SELECT
TO anon, authenticated
USING (
  marketplace_status = 'public'
  AND status = 'open'
  AND approval_status = 'approved'
);

-- Allow anonymous users to view client name/website for public marketplace jobs
DROP POLICY IF EXISTS "Public view marketplace clients" ON public.clients;
CREATE POLICY "Public view marketplace clients"
ON public.clients FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.client_id = clients.id
      AND j.marketplace_status = 'public'
      AND j.status = 'open'
      AND j.approval_status = 'approved'
  )
);

-- Guest job submissions (non-authenticated job posters)
CREATE TABLE IF NOT EXISTS public.guest_job_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending_payment',
  -- contact
  poster_name text NOT NULL,
  poster_email text NOT NULL,
  poster_company text,
  poster_phone text,
  -- job
  title text NOT NULL,
  category text,
  employment_type text,
  location text,
  remote_policy text,
  salary_min numeric,
  salary_max numeric,
  description text,
  summary text,
  apply_url text,
  -- payment stub
  payment_status text NOT NULL DEFAULT 'unpaid',
  payment_provider text,
  payment_reference text,
  -- linkage
  published_job_id uuid,
  review_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE public.guest_job_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can submit a guest posting
DROP POLICY IF EXISTS "Anyone insert guest job" ON public.guest_job_submissions;
CREATE POLICY "Anyone insert guest job"
ON public.guest_job_submissions FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only the row's review_token holder can view (handled out-of-band) — by default no one
-- For now, no select policy means no row reads from public client.
-- (Edge functions using service role can read.)

CREATE TRIGGER trg_guest_job_submissions_updated_at
BEFORE UPDATE ON public.guest_job_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();