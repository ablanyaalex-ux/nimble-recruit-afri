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
  });
  const [selectedHmIds, setSelectedHmIds] = useState<string[]>([]);

  const refresh = async () => {
    if (!currentWorkspaceId && !hm) return;
    setLoading(true);
    let q = supabase
      .from("jobs")
      .select("id, title, status, location, employment_type, client_id, clients(name)")
      .order("created_at", { ascending: false });
    if (currentWorkspaceId) q = q.eq("workspace_id", currentWorkspaceId);
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
  }, [currentWorkspaceId]);

  // Load contacts whenever client changes
  useEffect(() => {
    setSelectedHmIds([]);
    if (!form.client_id) {
      setContacts([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("id, name, title")
        .eq("client_id", form.client_id)
        .order("name");
      setContacts((data as ContactOpt[]) ?? []);
    })();
  }, [form.client_id]);

  const toggleHm = (id: string) => {
    setSelectedHmIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    setForm({ title: "", client_id: "", location: "", employment_type: "full_time", description: "" });
    setSelectedHmIds([]);
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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> New job</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New job</DialogTitle></DialogHeader>
                {clients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a client first to create a job.</p>
                ) : (
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Client</Label>
                      <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
                )}
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
                  <div className="font-display text-lg leading-tight">{j.title}</div>
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
