
-- Archived flag on candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS archived_by uuid;
CREATE INDEX IF NOT EXISTS idx_candidates_archived ON public.candidates(workspace_id, archived);

-- Candidate tags
CREATE TABLE IF NOT EXISTS public.candidate_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  tag text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON public.candidate_tags(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_workspace ON public.candidate_tags(workspace_id);

ALTER TABLE public.candidate_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View candidate tags" ON public.candidate_tags FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Insert candidate tags" ON public.candidate_tags FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Delete candidate tags" ON public.candidate_tags FOR DELETE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- Activity log helper for workspace-level (no job context) bulk actions
-- Allow inserting workspace-only logs by relaxing only what we need: action_types we use here
-- (existing INSERT policy already allows workspace_member to insert; OK as-is.)

-- Trigger to log archive/unarchive on candidates
CREATE OR REPLACE FUNCTION public.log_candidate_archive_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _jc record;
BEGIN
  IF NEW.archived IS DISTINCT FROM OLD.archived THEN
    -- Log against every job_candidate so the audit trail surfaces per-pipeline
    FOR _jc IN SELECT id, job_id FROM public.job_candidates WHERE candidate_id = NEW.id LOOP
      INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, from_value, to_value)
      VALUES (NEW.workspace_id, _jc.job_id, _jc.id, NEW.id, COALESCE(auth.uid(), NEW.archived_by),
              CASE WHEN NEW.archived THEN 'unarchived' ELSE 'archived' END,
              OLD.archived::text, NEW.archived::text);
    END LOOP;
    -- Always log a workspace-level row too, even if no jobs
    IF NOT EXISTS (SELECT 1 FROM public.job_candidates WHERE candidate_id = NEW.id) THEN
      INSERT INTO public.activity_logs (workspace_id, candidate_id, actor_id, action_type, from_value, to_value)
      VALUES (NEW.workspace_id, NEW.id, COALESCE(auth.uid(), NEW.archived_by),
              CASE WHEN NEW.archived THEN 'archived' ELSE 'unarchived' END,
              OLD.archived::text, NEW.archived::text);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_candidate_archive ON public.candidates;
CREATE TRIGGER trg_log_candidate_archive AFTER UPDATE OF archived ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.log_candidate_archive_activity();

-- Trigger to log tag added
CREATE OR REPLACE FUNCTION public.log_candidate_tag_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _jc record; _logged boolean := false;
BEGIN
  FOR _jc IN SELECT id, job_id FROM public.job_candidates WHERE candidate_id = NEW.candidate_id LOOP
    INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, to_value, metadata)
    VALUES (NEW.workspace_id, _jc.job_id, _jc.id, NEW.candidate_id, NEW.created_by, 'tag_added', NEW.tag, jsonb_build_object('tag', NEW.tag));
    _logged := true;
  END LOOP;
  IF NOT _logged THEN
    INSERT INTO public.activity_logs (workspace_id, candidate_id, actor_id, action_type, to_value, metadata)
    VALUES (NEW.workspace_id, NEW.candidate_id, NEW.created_by, 'tag_added', NEW.tag, jsonb_build_object('tag', NEW.tag));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_candidate_tag ON public.candidate_tags;
CREATE TRIGGER trg_log_candidate_tag AFTER INSERT ON public.candidate_tags
FOR EACH ROW EXECUTE FUNCTION public.log_candidate_tag_activity();
