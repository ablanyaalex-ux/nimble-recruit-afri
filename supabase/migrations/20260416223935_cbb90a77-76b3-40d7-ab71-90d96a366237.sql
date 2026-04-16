-- =========================================
-- ROLE ENUM
-- =========================================
CREATE TYPE public.workspace_role AS ENUM ('owner', 'recruiter', 'viewer');

-- =========================================
-- TIMESTAMPS HELPER
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- WORKSPACES
-- =========================================
CREATE TABLE public.workspaces (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- WORKSPACE MEMBERS (roles)
-- =========================================
CREATE TABLE public.workspace_members (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'recruiter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);

-- =========================================
-- SECURITY DEFINER FUNCTIONS (avoid RLS recursion)
-- =========================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_user_id UUID, _workspace_id UUID, _role public.workspace_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id AND role = _role
  );
$$;

-- =========================================
-- WORKSPACES POLICIES
-- =========================================
CREATE POLICY "Members view their workspaces"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Authenticated users create workspaces"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners update workspaces"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.has_workspace_role(auth.uid(), id, 'owner'));

CREATE POLICY "Owners delete workspaces"
  ON public.workspaces FOR DELETE TO authenticated
  USING (public.has_workspace_role(auth.uid(), id, 'owner'));

-- =========================================
-- WORKSPACE MEMBERS POLICIES
-- =========================================
CREATE POLICY "Members view co-members"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Allow inserting your own membership row (used when creating a workspace)
CREATE POLICY "User inserts own membership"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can add other members
CREATE POLICY "Owners add members"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

CREATE POLICY "Owners update memberships"
  ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

CREATE POLICY "Owners remove members"
  ON public.workspace_members FOR DELETE TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'owner'));

-- =========================================
-- AVATARS STORAGE
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);