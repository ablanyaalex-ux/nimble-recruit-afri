import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type WorkspaceRole = "owner" | "recruiter" | "viewer" | "hiring_manager";

export type WorkspaceMembership = {
  workspace_id: string;
  role: WorkspaceRole;
  workspaces: { id: string; name: string };
};

type WorkspaceContextValue = {
  loading: boolean;
  memberships: WorkspaceMembership[];
  currentWorkspaceId: string | null;
  currentRole: WorkspaceRole | null;
  setCurrentWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
const STORAGE_KEY = "tf.currentWorkspaceId";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name)")
      .eq("user_id", user.id);

    if (!error && data) {
      const list = data as unknown as WorkspaceMembership[];
      setMemberships(list);
      if (list.length > 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        const valid = stored && list.some((m) => m.workspace_id === stored);
        if (!valid) {
          localStorage.setItem(STORAGE_KEY, list[0].workspace_id);
          setCurrentWorkspaceIdState(list[0].workspace_id);
        } else {
          setCurrentWorkspaceIdState(stored);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setCurrentWorkspaceIdState(null);
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCurrentWorkspaceId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setCurrentWorkspaceIdState(id);
  };

  const currentRole =
    memberships.find((m) => m.workspace_id === currentWorkspaceId)?.role ?? null;

  return (
    <WorkspaceContext.Provider
      value={{ loading, memberships, currentWorkspaceId, currentRole, setCurrentWorkspaceId, refresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
