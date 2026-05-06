import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { z } from "zod";
import { Mail, Copy, Trash2, Check, X, Link2, AlertTriangle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendInviteEmail } from "@/lib/invites";
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

type ClientOption = { id: string; name: string };

type MemberRow = {
  id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile: { display_name: string | null; avatar_url: string | null } | null;
  linkedClients: { id: string; name: string }[];
};

const baseInviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  role: z.enum(["recruiter", "viewer", "hiring_manager"]),
});

export default function Team() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole, loading } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"recruiter" | "viewer" | "hiring_manager">("recruiter");
  const [hmClientId, setHmClientId] = useState("");
  const [hmName, setHmName] = useState("");
  const [hmTitle, setHmTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [linkTarget, setLinkTarget] = useState<MemberRow | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

  const isOwner = currentRole === "owner";

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setListLoading(true);
    const [invitesRes, membersRes, clientsRes] = await Promise.all([
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
      supabase
        .from("clients")
        .select("id, name")
        .eq("workspace_id", currentWorkspaceId)
        .order("name"),
    ]);

    if (invitesRes.data) setInvites(invitesRes.data as InviteRow[]);
    if (clientsRes.data) setClients(clientsRes.data as ClientOption[]);

    if (membersRes.data) {
      const ids = membersRes.data.map((m) => m.user_id);
      const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
      const [profilesRes, contactsRes] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url").in("id", safeIds),
        supabase
          .from("client_contacts")
          .select("id, user_id, email, client_id, clients(name)")
          .in("user_id", safeIds),
      ]);
      const byId = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const linksByUser = new Map<string, { id: string; name: string }[]>();
      (contactsRes.data ?? []).forEach((c: any) => {
        if (!c.user_id) return;
        const arr = linksByUser.get(c.user_id) ?? [];
        arr.push({ id: c.client_id, name: c.clients?.name ?? "Unknown client" });
        linksByUser.set(c.user_id, arr);
      });
      setMembers(
        membersRes.data.map((m) => ({
          ...(m as any),
          profile: byId.get(m.user_id) ?? null,
          linkedClients: linksByUser.get(m.user_id) ?? [],
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
    const parsed = baseInviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (role === "hiring_manager") {
      if (!hmClientId) return toast.error("Pick a client to link this hiring manager to.");
      if (!hmName.trim()) return toast.error("Enter the hiring manager's name.");
    }

    setSubmitting(true);

    if (role === "hiring_manager") {
      // Create the client_contacts row first so the trigger can link on signup.
      const { error: cErr } = await supabase.from("client_contacts").insert({
        client_id: hmClientId,
        name: hmName.trim(),
        email: parsed.data.email,
        title: hmTitle.trim() || null,
      });
      if (cErr) {
        setSubmitting(false);
        return toast.error(`Couldn't create contact: ${cErr.message}`);
      }
    }

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
    const workspaceName = memberships.find((m) => m.workspace_id === currentWorkspaceId)?.workspaces?.name;
    const emailError = await sendInviteEmail({
      email: parsed.data.email,
      inviteLink: link,
      role: parsed.data.role,
      workspaceName,
    });
    if (emailError) {
      toast.warning("Invite created, but email was not sent. Link copied to clipboard.");
    } else {
      toast.success("Invite email sent — link copied to clipboard.");
    }
    setEmail("");
    setHmClientId("");
    setHmName("");
    setHmTitle("");
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

  const openLinkDialog = (m: MemberRow) => {
    setLinkTarget(m);
    setLinkClientId("");
    setLinkName(m.profile?.display_name ?? "");
    setLinkEmail("");
    setLinkTitle("");
  };

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTarget) return;
    if (!linkClientId) return toast.error("Pick a client.");
    if (!linkName.trim()) return toast.error("Name is required.");
    if (!linkEmail.trim()) return toast.error("Email is required (it must match the user's login email).");
    const { error } = await supabase.from("client_contacts").insert({
      client_id: linkClientId,
      name: linkName.trim(),
      email: linkEmail.trim(),
      title: linkTitle.trim() || null,
      user_id: linkTarget.user_id,
    });
    if (error) return toast.error(error.message);
    toast.success("Hiring manager linked to client.");
    setLinkTarget(null);
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
            <form onSubmit={onInvite} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
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
                  <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
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
              </div>

              {role === "hiring_manager" && (
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Hiring managers see only the client they're linked to. Pick a client and add their details so they're connected automatically when they accept the invite.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Client</Label>
                      <Select value={hmClientId} onValueChange={setHmClientId}>
                        <SelectTrigger>
                          <SelectValue placeholder={clients.length ? "Choose a client" : "No clients yet — create one first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={hmName} onChange={(e) => setHmName(e.target.value)} placeholder="Jane Smith" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Title (optional)</Label>
                      <Input value={hmTitle} onChange={(e) => setHmTitle(e.target.value)} placeholder="Head of Engineering" />
                    </div>
                  </div>
                </div>
              )}
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
                            <Badge variant="secondary" className="capitalize">{inv.role.replace("_", " ")}</Badge>
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
                {members.map((m) => {
                  const isHM = m.role === "hiring_manager";
                  const unlinked = isHM && m.linkedClients.length === 0;
                  return (
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
                          <div className="text-xs text-muted-foreground capitalize mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{m.role.replace("_", " ")}</span>
                            {isHM && m.linkedClients.map((c) => (
                              <Badge key={c.id} variant="outline" className="font-normal">{c.name}</Badge>
                            ))}
                            {unlinked && (
                              <Badge variant="destructive" className="gap-1 font-normal">
                                <AlertTriangle className="h-3 w-3" /> Not linked to a client
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {unlinked && (
                          <Button size="sm" variant="outline" onClick={() => openLinkDialog(m)}>
                            <Link2 className="h-4 w-4" /> Link to client
                          </Button>
                        )}
                        {m.role !== "owner" && m.user_id !== user?.id && (
                          <Button size="sm" variant="ghost" onClick={() => removeMember(m.id, m.user_id)} title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                          <Badge variant="outline" className="capitalize">{inv.role.replace("_", " ")}</Badge>
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

      <Dialog open={!!linkTarget} onOpenChange={(o) => !o && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link hiring manager to a client</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitLink} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The email must match the email this teammate uses to sign in, otherwise they still won't see this client's data.
            </p>
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={linkClientId} onValueChange={setLinkClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Head of Engineering" />
            </div>
            <DialogFooter>
              <Button type="submit">Link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
