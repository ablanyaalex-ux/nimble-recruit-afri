
CREATE TABLE public.communication_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  subject text NOT NULL DEFAULT '(no subject)',
  channel text NOT NULL DEFAULT 'email',
  candidate_id uuid,
  job_candidate_id uuid,
  contact_id uuid,
  participant_email text,
  participant_name text,
  reply_to_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_threads_ws_last ON public.communication_threads(workspace_id, last_message_at DESC);
CREATE UNIQUE INDEX idx_threads_reply_token ON public.communication_threads(reply_to_token);

ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View threads" ON public.communication_threads FOR SELECT TO authenticated
  USING (public.is_non_hm_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert threads" ON public.communication_threads FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Update threads" ON public.communication_threads FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Delete threads" ON public.communication_threads FOR DELETE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON public.communication_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  sender_user_id uuid,
  sender_email text,
  sender_name text,
  recipient_email text,
  body text NOT NULL DEFAULT '',
  body_html text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread ON public.messages(thread_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_non_hm_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Insert messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Update messages" ON public.messages FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));
CREATE POLICY "Delete messages" ON public.messages FOR DELETE TO authenticated
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE OR REPLACE FUNCTION public.bump_thread_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.communication_threads
  SET last_message_at = NEW.created_at,
      last_message_preview = left(NEW.body, 200),
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
      updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_thread AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_on_message();
