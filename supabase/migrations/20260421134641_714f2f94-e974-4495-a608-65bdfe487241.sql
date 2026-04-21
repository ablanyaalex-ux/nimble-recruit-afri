-- 1) Change job_candidates.stage from enum to text so custom stages are allowed
ALTER TABLE public.job_candidates
  ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE public.job_candidates
  ALTER COLUMN stage TYPE text USING stage::text;
ALTER TABLE public.job_candidates
  ALTER COLUMN stage SET DEFAULT 'application';

-- Migrate legacy stage values to new defaults
UPDATE public.job_candidates SET stage = 'reviewed' WHERE stage IN ('sourced','contacted','screened');
UPDATE public.job_candidates SET stage = 'first_interview' WHERE stage = 'interview';
UPDATE public.job_candidates SET stage = 'offer_accepted' WHERE stage = 'hired';

-- 2) Workspace-level pipeline stages
CREATE TABLE IF NOT EXISTS public.workspace_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  position int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

ALTER TABLE public.workspace_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View pipeline stages"
ON public.workspace_pipeline_stages FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Manage pipeline stages"
ON public.workspace_pipeline_stages FOR ALL TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id))
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

-- 3) Seed default stages for every existing workspace
INSERT INTO public.workspace_pipeline_stages (workspace_id, key, label, position, is_default)
SELECT w.id, s.key, s.label, s.position, true
FROM public.workspaces w
CROSS JOIN (VALUES
  ('application', 'Application', 1),
  ('reviewed', 'Reviewed', 2),
  ('first_interview', 'First Interview', 3),
  ('second_interview', 'Second Interview', 4),
  ('offer', 'Offer', 5),
  ('offer_accepted', 'Offer Accepted', 6),
  ('rejected', 'Rejected', 7)
) AS s(key, label, position)
ON CONFLICT (workspace_id, key) DO NOTHING;

-- 4) Auto-seed default stages whenever a new workspace is created
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_pipeline_stages (workspace_id, key, label, position, is_default)
  VALUES
    (NEW.id, 'application', 'Application', 1, true),
    (NEW.id, 'reviewed', 'Reviewed', 2, true),
    (NEW.id, 'first_interview', 'First Interview', 3, true),
    (NEW.id, 'second_interview', 'Second Interview', 4, true),
    (NEW.id, 'offer', 'Offer', 5, true),
    (NEW.id, 'offer_accepted', 'Offer Accepted', 6, true),
    (NEW.id, 'rejected', 'Rejected', 7, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_pipeline_stages ON public.workspaces;
CREATE TRIGGER trg_seed_default_pipeline_stages
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.seed_default_pipeline_stages();

-- 5) Candidate source
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS source text;