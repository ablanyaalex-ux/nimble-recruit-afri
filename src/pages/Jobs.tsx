import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Briefcase, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { canEditWorkspace, isHiringManager } from "@/lib/permissions";
import { jobStatusBadgeClass, jobStatusLabel } from "@/lib/jobStatus";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Job = {
  id: string;
  title: string;
  status: string;
  location: string | null;
  employment_type: string | null;
  reference: string | null;
  client_id: string;
  clients: { name: string } | null;
};

// Mirror of public.job_reference_prefix() — uppercase alphanumerics, max 6 chars.
const referencePrefix = (name: string) =>
  (name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6) || "JOB");

type ClientOpt = { id: string; name: string };
type ContactOpt = { id: string; name: string; title: string | null };

export default function Jobs() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const hm = isHiringManager(currentRole);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    client_id: "",
    location: "",
    employment_type: "full_time",
    description: "",
    reference: "",
  });
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedHmIds, setSelectedHmIds] = useState<string[]>([]);

  const refresh = async () => {
    if (!currentWorkspaceId && !hm) return;
    setLoading(true);
    let q = supabase
      .from("jobs")
      .select("id, title, status, location, employment_type, reference, client_id, clients(name)")
      .order("created_at", { ascending: false });
    // For non-HM users scope by current workspace.
    // For HMs we rely on RLS — they only see jobs they're assigned to.
    if (currentWorkspaceId && !hm) q = q.eq("workspace_id", currentWorkspaceId);
    const { data } = await q;
    if (data) setJobs(data as unknown as Job[]);

    if (currentWorkspaceId && canEdit) {
      const { data: cs } = await supabase
        .from("clients")
        .select("id, name")
        .eq("workspace_id", currentWorkspaceId)
        .order("name");
      if (cs) setClients(cs);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, user?.id, hm]);

  // Suggest a reference & load contacts whenever client changes
  useEffect(() => {
    setSelectedHmIds([]);
    if (!form.client_id) {
      setContacts([]);
      if (!referenceTouched) setForm((f) => ({ ...f, reference: "" }));
      return;
    }
    const client = clients.find((c) => c.id === form.client_id);
    if (client && !referenceTouched) {
      const prefix = referencePrefix(client.name);
      // Count existing jobs for this client to suggest the next number
      const used = jobs.filter((j) => j.client_id === form.client_id).length + 1;
      setForm((f) => ({ ...f, reference: `${prefix}-${String(used).padStart(3, "0")}` }));
    }
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("id, name, title")
        .eq("client_id", form.client_id)
        .order("name");
      setContacts((data as ContactOpt[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.client_id]);

  const toggleHm = (id: string) => {
    setSelectedHmIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetForm = () => {
    setForm({ title: "", client_id: "", location: "", employment_type: "full_time", description: "", reference: "" });
    setReferenceTouched(false);
    setSelectedHmIds([]);
    setNewClientOpen(false);
    setNewClientName("");
  };

  const createClientInline = async () => {
    if (!user || !currentWorkspaceId) return;
    const name = newClientName.trim();
    if (!name) return toast.error("Client name is required");
    setCreatingClient(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({ workspace_id: currentWorkspaceId, name, created_by: user.id })
      .select("id, name")
      .single();
    setCreatingClient(false);
    if (error || !data) return toast.error(error?.message ?? "Failed to create client");
    setClients((prev) => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((f) => ({ ...f, client_id: data.id }));
    setNewClientName("");
    setNewClientOpen(false);
    toast.success("Client created.");
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentWorkspaceId) return;
    if (!form.title.trim() || !form.client_id) return toast.error("Title and client are required");
    const { data: created, error } = await supabase
      .from("jobs")
      .insert({
        workspace_id: currentWorkspaceId,
        client_id: form.client_id,
        title: form.title.trim(),
        location: form.location.trim() || null,
        employment_type: form.employment_type || null,
        description: form.description.trim() || null,
        reference: form.reference.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return toast.error(error?.message ?? "Failed to create");

    if (selectedHmIds.length > 0) {
      const { error: hmErr } = await supabase
        .from("job_hiring_managers")
        .insert(selectedHmIds.map((cid) => ({ job_id: created.id, contact_id: cid })));
      if (hmErr) toast.error(`Job created, but assigning HMs failed: ${hmErr.message}`);
    }

    toast.success("Job created.");
    setOpen(false);
    resetForm();
    refresh();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Pipeline"
        title="Jobs"
        description={hm ? "Roles you've been assigned as hiring manager." : "Open and active roles across your clients."}
        actions={
          canEdit && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> New job</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New job</DialogTitle></DialogHeader>
                <form onSubmit={onCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Client</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setNewClientOpen((v) => !v)}
                      >
                        <Plus className="h-3 w-3" /> {newClientOpen ? "Cancel" : "New client"}
                      </Button>
                    </div>
                    {newClientOpen ? (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          placeholder="Client name"
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); createClientInline(); }
                          }}
                        />
                        <Button type="button" onClick={createClientInline} disabled={creatingClient}>
                          {creatingClient ? "Adding…" : "Add"}
                        </Button>
                      </div>
                    ) : clients.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No clients yet — use “New client” above to add one.
                      </p>
                    ) : (
                      <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Job ID</Label>
                      {referenceTouched && form.client_id && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const client = clients.find((c) => c.id === form.client_id);
                            if (client) {
                              const used = jobs.filter((j) => j.client_id === form.client_id).length + 1;
                              setForm((f) => ({ ...f, reference: `${referencePrefix(client.name)}-${String(used).padStart(3, "0")}` }));
                              setReferenceTouched(false);
                            }
                          }}
                        >
                          Reset to auto
                        </button>
                      )}
                    </div>
                    <Input
                      placeholder={form.client_id ? "Auto-generated" : "Pick a client to auto-generate"}
                      value={form.reference}
                      onChange={(e) => { setForm({ ...form, reference: e.target.value }); setReferenceTouched(true); }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Auto-suggested from client name. Leave blank to let the system assign one.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input placeholder="Remote / London" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Full-time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="part_time">Part-time</SelectItem>
                          <SelectItem value="temp">Temp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {form.client_id && (
                    <div className="space-y-2">
                      <Label>Hiring managers</Label>
                      {contacts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No contacts on this client yet. Add them on the client page.
                        </p>
                      ) : (
                        <>
                          <Select value="" onValueChange={toggleHm}>
                            <SelectTrigger><SelectValue placeholder="Add hiring manager…" /></SelectTrigger>
                            <SelectContent>
                              {contacts
                                .filter((c) => !selectedHmIds.includes(c.id))
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}{c.title ? ` — ${c.title}` : ""}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          {selectedHmIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedHmIds.map((id) => {
                                const c = contacts.find((x) => x.id === id);
                                if (!c) return null;
                                return (
                                  <Badge key={id} variant="secondary" className="gap-1">
                                    {c.name}
                                    <button type="button" onClick={() => toggleHm(id)}>
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <DialogFooter><Button type="submit">Create</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <Card className="p-10 text-center">
          <Briefcase className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-display text-xl">No jobs yet</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`}>
              <Card className="p-5 hover:border-primary/40 transition-colors flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display text-lg leading-tight">{j.title}</div>
                    {j.reference && (
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {j.reference}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{j.clients?.name ?? "—"}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</span>}
                    {j.employment_type && <span className="capitalize">{j.employment_type.replace("_", " ")}</span>}
                  </div>
                </div>
                <Badge className={`shrink-0 ${jobStatusBadgeClass(j.status)}`}>{jobStatusLabel(j.status)}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
