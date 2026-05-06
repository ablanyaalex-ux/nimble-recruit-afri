import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Star, Trash2, Mail, Phone, Briefcase, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { canEditWorkspace } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendInviteEmail } from "@/lib/invites";
import { toast } from "sonner";

type Client = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  workspace_id: string;
};

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  user_id: string | null;
};

type Job = {
  id: string;
  title: string;
  status: string;
  location: string | null;
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const [client, setClient] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    is_primary: false,
  });
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", website: "", industry: "", notes: "" });
  const [savingClient, setSavingClient] = useState(false);

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    const [clientRes, contactsRes, jobsRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("client_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }).order("name"),
      supabase.from("jobs").select("id, title, status, location").eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    if (clientRes.data) setClient(clientRes.data as Client);
    if (contactsRes.data) setContacts(contactsRes.data as Contact[]);
    if (jobsRes.data) setJobs(jobsRes.data as Job[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!contactForm.name.trim()) return toast.error("Name is required");
    const { error } = await supabase.from("client_contacts").insert({
      client_id: id,
      name: contactForm.name.trim(),
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      title: contactForm.title.trim() || null,
      is_primary: contactForm.is_primary,
    });
    if (error) return toast.error(error.message);
    toast.success("Contact added.");
    setContactOpen(false);
    setContactForm({ name: "", email: "", phone: "", title: "", is_primary: false });
    refresh();
  };

  const togglePrimary = async (c: Contact) => {
    const { error } = await supabase
      .from("client_contacts")
      .update({ is_primary: !c.is_primary })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const removeContact = async (cid: string) => {
    const { error } = await supabase.from("client_contacts").delete().eq("id", cid);
    if (error) return toast.error(error.message);
    refresh();
  };

  const openEditClient = () => {
    if (!client) return;
    setClientForm({
      name: client.name,
      website: client.website ?? "",
      industry: client.industry ?? "",
      notes: client.notes ?? "",
    });
    setEditClientOpen(true);
  };

  const saveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!clientForm.name.trim()) return toast.error("Name is required");
    setSavingClient(true);
    const { error } = await supabase
      .from("clients")
      .update({
        name: clientForm.name.trim(),
        website: clientForm.website.trim() || null,
        industry: clientForm.industry.trim() || null,
        notes: clientForm.notes.trim() || null,
      })
      .eq("id", client.id);
    setSavingClient(false);
    if (error) return toast.error(error.message);
    toast.success("Client updated.");
    setEditClientOpen(false);
    refresh();
  };

  const inviteAsHM = async (c: Contact) => {
    if (!c.email || !user || !client) return toast.error("Contact needs an email.");
    const { error } = await supabase.from("workspace_invites").insert({
      workspace_id: client.workspace_id,
      email: c.email,
      role: "hiring_manager",
      invited_by: user.id,
    });
    if (error) {
      if (error.code === "23505") return toast.error("Pending invite already exists for this email.");
      return toast.error(error.message);
    }
    const { data: inv } = await supabase
      .from("workspace_invites")
      .select("token")
      .eq("workspace_id", client.workspace_id)
      .eq("email", c.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (inv?.token) {
      const link = `${window.location.origin}/invite/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      const emailError = await sendInviteEmail({
        email: c.email,
        inviteLink: link,
        role: "hiring_manager",
        workspaceName: client.name,
      });
      if (emailError) {
        toast.warning("Invite created, but email was not sent. Link copied.");
      } else {
        toast.success("Invite email sent — link copied.");
      }
    }
  };

  if (loading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!client) return <PageContainer><p>Client not found.</p></PageContainer>;

  return (
    <PageContainer>
      <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <PageHeader
        eyebrow={client.industry ?? "Client"}
        title={client.name}
        description={client.website ?? undefined}
        actions={
          canEdit && (
            <Button variant="outline" size="sm" onClick={openEditClient}>
              <Pencil className="h-4 w-4" /> Edit client
            </Button>
          )
        }
      />

      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit client</DialogTitle></DialogHeader>
          <form onSubmit={saveClient} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={clientForm.industry} onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={clientForm.website} onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })} placeholder="https://" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={4} value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={savingClient}>{savingClient ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-6">
          <p className="text-xs text-muted-foreground mb-3">
            Add a contact, then invite them as a hiring manager to give them scoped access to this client's jobs and candidates.
          </p>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-display text-lg">Hiring managers & contacts</h2>
            {canEdit && (
              <Dialog open={contactOpen} onOpenChange={setContactOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" /> Add contact</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
                  <form onSubmit={addContact} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input placeholder="Head of Engineering" value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={contactForm.is_primary} onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })} />
                      Primary point of contact
                    </label>
                    <DialogFooter><Button type="submit">Add contact</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {contacts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No contacts yet.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {contacts.map((c) => (
                <div key={c.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      {c.is_primary && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3 fill-current" /> Primary</Badge>}
                      {c.user_id && <Badge variant="outline">Has login</Badge>}
                    </div>
                    {c.title && <div className="text-sm text-muted-foreground mt-0.5">{c.title}</div>}
                    <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-3">
                      {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                      {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => togglePrimary(c)} title={c.is_primary ? "Unset primary" : "Mark primary"}>
                        <Star className={`h-4 w-4 ${c.is_primary ? "fill-current text-primary" : ""}`} />
                      </Button>
                      {!c.user_id && c.email && (
                        <Button size="sm" variant="outline" onClick={() => inviteAsHM(c)}>
                          <Mail className="h-4 w-4" /> Invite as hiring manager
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeContact(c.id)} title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-6">
          {jobs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No jobs yet for this client.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {jobs.map((j) => (
                <Link key={j.id} to={`/jobs/${j.id}`} className="p-4 flex items-center justify-between hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{j.title}</div>
                      {j.location && <div className="text-xs text-muted-foreground">{j.location}</div>}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{j.status.replace("_", " ")}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-6">
          <Card className="p-6 space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Industry</Label>
              <p className="mt-1">{client.industry || "—"}</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Website</Label>
              <p className="mt-1">{client.website || "—"}</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <p className="mt-1 whitespace-pre-wrap text-sm">{client.notes || "—"}</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
