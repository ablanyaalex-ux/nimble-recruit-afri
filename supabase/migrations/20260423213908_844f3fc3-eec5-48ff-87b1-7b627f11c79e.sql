-- Add reference column for human-friendly job identifier
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS reference text;

-- Unique within a workspace (case-insensitive), but allow nulls
CREATE UNIQUE INDEX IF NOT EXISTS jobs_workspace_reference_unique
  ON public.jobs (workspace_id, lower(reference))
  WHERE reference IS NOT NULL;

-- Helper to derive a slug-ish prefix from the client name (uppercase letters/digits, max 6 chars)
CREATE OR REPLACE FUNCTION public.job_reference_prefix(_client_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      substr(
        regexp_replace(upper(coalesce(_client_name, '')), '[^A-Z0-9]+', '', 'g'),
        1, 6
      ),
      ''
    ),
    'JOB'
  );
$$;

-- Generate a unique reference for a workspace+client like ACME-001, ACME-002...
CREATE OR REPLACE FUNCTION public.generate_job_reference(_workspace_id uuid, _client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _name text;
  _next int;
  _candidate text;
BEGIN
  SELECT name INTO _name FROM public.clients WHERE id = _client_id;
  _prefix := public.job_reference_prefix(_name);

  -- Find max numeric suffix already used for this prefix in this workspace
  SELECT COALESCE(MAX((regexp_match(reference, '^' || _prefix || '-(\d+)$'))[1]::int), 0) + 1
    INTO _next
  FROM public.jobs
  WHERE workspace_id = _workspace_id
    AND reference ~ ('^' || _prefix || '-\d+$');

  LOOP
    _candidate := _prefix || '-' || lpad(_next::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.jobs
      WHERE workspace_id = _workspace_id AND lower(reference) = lower(_candidate)
    );
    _next := _next + 1;
  END LOOP;

  RETURN _candidate;
END;
$$;

-- Trigger to auto-fill reference on insert when not provided
CREATE OR REPLACE FUNCTION public.jobs_set_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR btrim(NEW.reference) = '' THEN
    NEW.reference := public.generate_job_reference(NEW.workspace_id, NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_set_reference_trg ON public.jobs;
CREATE TRIGGER jobs_set_reference_trg
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_set_reference();

-- Backfill existing jobs missing a reference
DO $$
DECLARE
  _row record;
BEGIN
  FOR _row IN SELECT id, workspace_id, client_id FROM public.jobs WHERE reference IS NULL LOOP
    UPDATE public.jobs
      SET reference = public.generate_job_reference(_row.workspace_id, _row.client_id)
      WHERE id = _row.id;
  END LOOP;
END $$;