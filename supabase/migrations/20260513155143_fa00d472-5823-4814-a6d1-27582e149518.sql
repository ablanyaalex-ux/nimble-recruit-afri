
-- Documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents', 'candidate-documents', false)
ON CONFLICT (id) DO NOTHING;

-- candidate_documents table (files + assessment links)
CREATE TABLE IF NOT EXISTS public.candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_candidate_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('file','link')),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('cv','task','reference','assessment','other')),
  name text NOT NULL,
  file_path text,
  url text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cd_jc ON public.candidate_documents(job_candidate_id, created_at DESC);

ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View candidate documents" ON public.candidate_documents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.jobs j
  JOIN public.job_candidates jc ON jc.job_id = j.id
  WHERE jc.id = candidate_documents.job_candidate_id
    AND (public.is_non_hm_workspace_member(auth.uid(), j.workspace_id)
         OR public.is_assigned_hiring_manager(auth.uid(), j.id))
));

CREATE POLICY "Insert candidate documents" ON public.candidate_documents
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.is_workspace_member(auth.uid(), workspace_id)
);

CREATE POLICY "Delete candidate documents" ON public.candidate_documents
FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.can_edit_workspace(auth.uid(), workspace_id));

-- Storage policies for candidate-documents bucket
CREATE POLICY "Workspace members read candidate docs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND EXISTS (
    SELECT 1 FROM public.candidate_documents d
    WHERE d.file_path = storage.objects.name
  )
);

CREATE POLICY "Workspace members upload candidate docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'candidate-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Workspace members delete candidate docs" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'candidate-documents' AND auth.uid() IS NOT NULL);

-- Activity log trigger for documents
CREATE OR REPLACE FUNCTION public.log_candidate_document_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_id uuid;
BEGIN
  SELECT job_id INTO _job_id FROM public.job_candidates WHERE id = NEW.job_candidate_id;
  INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, to_value, metadata)
  VALUES (
    NEW.workspace_id, _job_id, NEW.job_candidate_id, NEW.candidate_id, NEW.uploaded_by,
    CASE WHEN NEW.kind = 'link' THEN 'assessment_added' ELSE 'document_uploaded' END,
    NEW.name,
    jsonb_build_object('category', NEW.category, 'document_id', NEW.id, 'kind', NEW.kind, 'url', NEW.url)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_candidate_doc ON public.candidate_documents;
CREATE TRIGGER trg_log_candidate_doc AFTER INSERT ON public.candidate_documents
FOR EACH ROW EXECUTE FUNCTION public.log_candidate_document_activity();

-- Activity log trigger for comments
CREATE OR REPLACE FUNCTION public.log_comment_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ws uuid; _job uuid; _cand uuid;
BEGIN
  SELECT j.workspace_id, jc.job_id, jc.candidate_id INTO _ws, _job, _cand
  FROM public.job_candidates jc JOIN public.jobs j ON j.id = jc.job_id
  WHERE jc.id = NEW.job_candidate_id;
  INSERT INTO public.activity_logs (workspace_id, job_id, job_candidate_id, candidate_id, actor_id, action_type, metadata)
  VALUES (_ws, _job, NEW.job_candidate_id, _cand, NEW.author_id, 'comment_added',
          jsonb_build_object('comment_id', NEW.id, 'preview', left(NEW.body, 200)));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_comment ON public.candidate_comments;
CREATE TRIGGER trg_log_comment AFTER INSERT ON public.candidate_comments
FOR EACH ROW EXECUTE FUNCTION public.log_comment_activity();
