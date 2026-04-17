import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { z } from "zod";
import { Mail, Copy, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, type WorkspaceRole } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type InviteRow = {
  id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile: { display_name: string | null; avatar_url: string | null } | null;
};

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  role: z.enum(["recruiter", "viewer", "hiring_manager"]),
});

export default function Team() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole, loading } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"recruiter" | "viewer" | "hiring_manager">("recruiter");
  const [submitting, setSubmitting] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const isOwner = currentRole === "owner";

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setListLoading(true);
    const [invitesRes, membersRes] = await Promise.all([
      supabase
        .from("workspace_invites")
        .select("id, email, role, token, status, expires_at, created_at")
        .eq("workspace_id", currentWorkspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("workspace_members")
        .select("id, user_id, role, created_at")
        .eq("workspace_id", currentWorkspaceId)
        .order("created_at", { ascending: true }),
    ]);

    if (invitesRes.data) setInvites(invitesRes.data as InviteRow[]);

    if (membersRes.data) {
      const ids = membersRes.data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setMembers(
        membersRes.data.map((m) => ({
          ...(m as any),
          profile: byId.get(m.user_id) ?? null,
        }))
      );
    }
    setListLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  if (!loading && !currentWorkspaceId) return <Navigate to="/onboarding/workspace" replace />;

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspaceId || !user) return;
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("workspace_invites")
      .insert({
        workspace_id: currentWorkspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        invited_by: user.id,
      })
      .select("token")
      .single();
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("There's already a pending invite for that email.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    const link = `${window.location.origin}/invite/${data!.token}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Invite created — link copied to clipboard.");
    setEmail("");
    refresh();
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied.");
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("workspace_invites")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked.");
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("workspace_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const removeMember = async (memberId: string, userId: string) => {
    if (userId === user?.id) {
      toast.error("You can't remove yourself.");
      return;
    }
    const { error } = await supabase.from("workspace_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Member removed.");
    refresh();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Invite teammates by email and decide what they can do."
      />

      {!isOwner ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Only workspace owners can manage invites and members.
        </Card>
      ) : (
        <>
          <Card className="p-5 md:p-6 mb-8">
            <form onSubmit={onInvite} className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "recruiter" | "viewer" | "hiring_manager")}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="hiring_manager">Hiring manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={submitting} className="h-10">
                <Mail className="h-4 w-4" />
                {submitting ? "Sending…" : "Send invite"}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              We'll generate an invite link you can share. The teammate will sign up or sign in with this email to join.
            </p>
          </Card>

          <section className="mb-10">
            <h2 className="font-display text-xl tracking-tight mb-3">Pending invites</h2>
            {listLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : invites.filter((i) => i.status === "pending").length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <Card className="divide-y divide-border">
                {invites
                  .filter((i) => i.status === "pending")
                  .map((inv) => {
                    const expired = new Date(inv.expires_at).getTime() < Date.now();
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{inv.email}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <Badge variant="secondary" className="capitalize">{inv.role}</Badge>
                            {expired ? (
                              <span className="text-destructive">Expired</span>
                            ) : (
                              <span>
                                Expires {new Date(inv.expires_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)} title="Copy link">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)} title="Revoke">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </Card>
            )}
          </section>

          <section className="mb-10">
            <h2 className="font-display text-xl tracking-tight mb-3">Members</h2>
            {listLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Card className="divide-y divide-border">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-secondary text-foreground grid place-items-center font-display text-sm">
                        {(m.profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {m.profile?.display_name ?? "Unnamed"}
                          {m.user_id === user?.id && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
                      </div>
                    </div>
                    {m.role !== "owner" && m.user_id !== user?.id && (
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m.id, m.user_id)} title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>

          {invites.some((i) => i.status !== "pending") && (
            <section>
              <h2 className="font-display text-xl tracking-tight mb-3">Past invites</h2>
              <Card className="divide-y divide-border">
                {invites
                  .filter((i) => i.status !== "pending")
                  .map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{inv.email}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">{inv.role}</Badge>
                          <span className="capitalize">
                            {inv.status === "accepted" ? (
                              <span className="text-primary inline-flex items-center gap-1">
                                <Check className="h-3 w-3" /> Accepted
                              </span>
                            ) : (
                              inv.status
                            )}
                          </span>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => remove(inv.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </Card>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
