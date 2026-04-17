import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type InvitePreview = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { setCurrentWorkspaceId, refresh: refreshWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: token });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setError("This invite link is invalid.");
      } else {
        setInvite(Array.isArray(data) ? (data[0] as InvitePreview) : (data as InvitePreview));
      }
      setLoading(false);
    })();
  }, [token]);

  const expired = invite && new Date(invite.expires_at).getTime() < Date.now();
  const wrongAccount =
    user && invite && user.email && user.email.toLowerCase() !== invite.email.toLowerCase();

  const goSignIn = () => {
    if (token) sessionStorage.setItem("tf.pendingInvite", token);
    navigate(`/auth?mode=signup&email=${encodeURIComponent(invite?.email ?? "")}`);
  };

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    const { data, error } = await supabase.rpc("accept_invite", { _token: token });
    setAccepting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Joined ${invite?.workspace_name}.`);
    await refreshWorkspaces();
    if (data) setCurrentWorkspaceId(data as string);
    sessionStorage.removeItem("tf.pendingInvite");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-secondary/40">
      <div className="w-full max-w-md bg-background border border-border rounded-lg p-8">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Workspace invite
        </div>
        {loading || authLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <>
            <h1 className="font-display text-2xl tracking-tight">Invite unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : invite?.status !== "pending" ? (
          <>
            <h1 className="font-display text-2xl tracking-tight">Invite no longer active</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite has been {invite?.status}.
            </p>
          </>
        ) : expired ? (
          <>
            <h1 className="font-display text-2xl tracking-tight">Invite expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the workspace owner to send a new invite.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl tracking-tight leading-tight">
              Join <em className="text-primary">{invite!.workspace_name}</em>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              You've been invited as <span className="capitalize text-foreground">{invite!.role}</span>.
              The invite was sent to <span className="text-foreground">{invite!.email}</span>.
            </p>

            <div className="mt-8 space-y-3">
              {!user ? (
                <Button className="w-full h-11" onClick={goSignIn}>
                  Sign in to accept
                </Button>
              ) : wrongAccount ? (
                <>
                  <p className="text-sm text-destructive">
                    You're signed in as {user.email}. Sign out and use {invite!.email} to accept.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      goSignIn();
                    }}
                  >
                    Sign out & switch account
                  </Button>
                </>
              ) : (
                <Button className="w-full h-11" onClick={accept} disabled={accepting}>
                  {accepting ? "Joining…" : `Accept invite`}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
