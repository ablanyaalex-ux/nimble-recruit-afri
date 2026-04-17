
-- 1. Extend role enum
ALTER TYPE public.workspace_role ADD VALUE IF NOT EXISTS 'hiring_manager';

-- 2. Pipeline stage enum
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM ('sourced','contacted','screened','interview','offer','hired','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.job_status AS ENUM ('open','on_hold','closed','filled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.feedback_recommendation AS ENUM ('strong_yes','yes','no','strong_no');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Helper functions (SECURITY DEFINER, avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.user_workspace_role(_uid uuid, _workspace_id uuid)
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = _uid AND workspace_id = _workspace_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_workspace(_uid uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _uid AND workspace_id = _workspace_id
      AND role IN ('owner','recruiter')
  );
$$;

-- 4. clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  industry text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_workspace ON public.clients(workspace_id);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. client_contacts
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_client ON public.client_contacts(client_id);
CREATE INDEX idx_contacts_user ON public.client_contacts(user_id);
CREATE INDEX idx_contacts_email ON public.client_contacts(lower(email));
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.client_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper that depends on client_contacts
CREATE OR REPLACE FUNCTION public.is_linked_hiring_manager(_uid uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_contacts
    WHERE client_id = _client_id AND user_id = _uid
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_client(_uid uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND (
        public.is_workspace_member(_uid, c.workspace_id)
        OR public.is_linked_hiring_manager(_uid, _client_id)
      )
  );
$$;

-- 6. jobs
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  location text,
  employment_type text,
  status public.job_status NOT NULL DEFAULT 'open',
  description text,
  salary_min numeric,
  salary_max numeric,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_workspace ON public.jobs(workspace_id);
CREATE INDEX idx_jobs_client ON public.jobs(client_id);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. job_hiring_managers
CREATE TABLE public.job_hiring_managers (
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.client_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, contact_id)
);
ALTER TABLE public.job_hiring_managers ENABLE ROW LEVEL SECURITY;

-- 8. candidates
CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  headline text,
  linkedin_url text,
  resume_path text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidates_workspace ON public.candidates(workspace_id);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. job_candidates (pipeline)
CREATE TABLE public.job_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage public.pipeline_stage NOT NULL DEFAULT 'sourced',
  position integer NOT NULL DEFAULT 0,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, candidate_id)
);
CREATE INDEX idx_jc_job_stage ON public.job_candidates(job_id, stage, position);
ALTER TABLE public.job_candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_jc_updated BEFORE UPDATE ON public.job_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. candidate_comments
CREATE TABLE public.candidate_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_candidate_id uuid NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_jc ON public.candidate_comments(job_candidate_id);
ALTER TABLE public.candidate_comments ENABLE ROW LEVEL SECURITY;

-- 11. comment_mentions
CREATE TABLE public.comment_mentions (
  comment_id uuid NOT NULL REFERENCES public.candidate_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, mentioned_user_id)
);
ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;

-- 12. interview_feedback
CREATE TABLE public.interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_candidate_id uuid NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  recommendation public.feedback_recommendation,
  strengths text,
  concerns text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_jc ON public.interview_feedback(job_candidate_id);
ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_feedback_updated BEFORE UPDATE ON public.interview_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id, read_at, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- clients
CREATE POLICY "View clients" ON public.clients FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_linked_hiring_manager(auth.uid(), id));

CREATE POLICY "Edit clients" ON public.clients FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Update clients" ON public.clients FOR UPDATE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Delete clients" ON public.clients FOR DELETE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- client_contacts
CREATE POLICY "View contacts" ON public.client_contacts FOR SELECT TO authenticated
USING (public.can_view_client(auth.uid(), client_id));

CREATE POLICY "Insert contacts" ON public.client_contacts FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND public.can_edit_workspace(auth.uid(), c.workspace_id)));

CREATE POLICY "Update contacts" ON public.client_contacts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND public.can_edit_workspace(auth.uid(), c.workspace_id)));

CREATE POLICY "Delete contacts" ON public.client_contacts FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND public.can_edit_workspace(auth.uid(), c.workspace_id)));

-- jobs
CREATE POLICY "View jobs" ON public.jobs FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_linked_hiring_manager(auth.uid(), client_id));

CREATE POLICY "Insert jobs" ON public.jobs FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Update jobs" ON public.jobs FOR UPDATE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Delete jobs" ON public.jobs FOR DELETE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- job_hiring_managers
CREATE POLICY "View jhm" ON public.job_hiring_managers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))));

CREATE POLICY "Manage jhm" ON public.job_hiring_managers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));

-- candidates
CREATE POLICY "View candidates" ON public.candidates FOR SELECT TO authenticated
USING (
  public.is_workspace_member(auth.uid(), workspace_id)
  OR EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.candidate_id = candidates.id
      AND public.is_linked_hiring_manager(auth.uid(), j.client_id)
  )
);

CREATE POLICY "Insert candidates" ON public.candidates FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Update candidates" ON public.candidates FOR UPDATE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Delete candidates" ON public.candidates FOR DELETE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- job_candidates
CREATE POLICY "View jc" ON public.job_candidates FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))));

CREATE POLICY "Insert jc" ON public.job_candidates FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)) AND added_by = auth.uid());

CREATE POLICY "Update jc" ON public.job_candidates FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));

CREATE POLICY "Delete jc" ON public.job_candidates FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_workspace(auth.uid(), j.workspace_id)));

-- candidate_comments
CREATE POLICY "View comments" ON public.candidate_comments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.job_candidates jc
  JOIN public.jobs j ON j.id = jc.job_id
  WHERE jc.id = job_candidate_id
    AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))
));

CREATE POLICY "Insert comments" ON public.candidate_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = job_candidate_id
      AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))
  )
);

CREATE POLICY "Delete own comments" ON public.candidate_comments FOR DELETE TO authenticated
USING (author_id = auth.uid());

-- comment_mentions
CREATE POLICY "View mentions" ON public.comment_mentions FOR SELECT TO authenticated
USING (
  mentioned_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.candidate_comments c
    JOIN public.job_candidates jc ON jc.id = c.job_candidate_id
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE c.id = comment_id
      AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))
  )
);

CREATE POLICY "Insert mentions" ON public.comment_mentions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.candidate_comments c WHERE c.id = comment_id AND c.author_id = auth.uid()));

-- interview_feedback
CREATE POLICY "View feedback" ON public.interview_feedback FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.job_candidates jc
  JOIN public.jobs j ON j.id = jc.job_id
  WHERE jc.id = job_candidate_id
    AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))
));

CREATE POLICY "Insert feedback" ON public.interview_feedback FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_candidates jc
    JOIN public.jobs j ON j.id = jc.job_id
    WHERE jc.id = job_candidate_id
      AND (public.is_workspace_member(auth.uid(), j.workspace_id) OR public.is_linked_hiring_manager(auth.uid(), j.client_id))
  )
);

CREATE POLICY "Update own feedback" ON public.interview_feedback FOR UPDATE TO authenticated
USING (author_id = auth.uid());

CREATE POLICY "Delete own feedback" ON public.interview_feedback FOR DELETE TO authenticated
USING (author_id = auth.uid());

-- notifications
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============ TRIGGERS ============

-- Auto-create notifications when someone is mentioned
CREATE OR REPLACE FUNCTION public.handle_new_mention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _comment record;
  _candidate_name text;
BEGIN
  SELECT c.*, jc.job_id, jc.candidate_id INTO _comment
  FROM public.candidate_comments c
  JOIN public.job_candidates jc ON jc.id = c.job_candidate_id
  WHERE c.id = NEW.comment_id;

  SELECT full_name INTO _candidate_name FROM public.candidates WHERE id = _comment.candidate_id;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    NEW.mentioned_user_id,
    'mention',
    jsonb_build_object(
      'comment_id', NEW.comment_id,
      'job_candidate_id', _comment.job_candidate_id,
      'job_id', _comment.job_id,
      'candidate_id', _comment.candidate_id,
      'candidate_name', _candidate_name,
      'author_id', _comment.author_id,
      'preview', left(_comment.body, 200)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mention_notify
AFTER INSERT ON public.comment_mentions
FOR EACH ROW EXECUTE FUNCTION public.handle_new_mention();

-- Auto-link hiring_manager users to existing client_contacts on signup (by email)
CREATE OR REPLACE FUNCTION public.link_contact_to_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.client_contacts
  SET user_id = NEW.id
  WHERE user_id IS NULL AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_contact_on_signup ON auth.users;
CREATE TRIGGER trg_link_contact_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_contact_to_user();

-- ============ STORAGE: resumes bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Resume access: workspace members of the candidate's workspace, OR linked hiring manager for any job that candidate is on
CREATE POLICY "Read resumes" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND (
        public.is_workspace_member(auth.uid(), c.workspace_id)
        OR EXISTS (
          SELECT 1 FROM public.job_candidates jc
          JOIN public.jobs j ON j.id = jc.job_id
          WHERE jc.candidate_id = c.id
            AND public.is_linked_hiring_manager(auth.uid(), j.client_id)
        )
      )
  )
);

CREATE POLICY "Upload resumes" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND public.can_edit_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Update resumes" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes'
  AND public.can_edit_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Delete resumes" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes'
  AND public.can_edit_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
