import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

type JobInput = {
  id: string;
  title: string;
  client_id: string;
  workspace_id: string;
  location: string | null;
  employment_type: string | null;
  description: string | null;
  reference: string | null;
};

type ClientOpt = { id: string; name: string };
type ContactOpt = { id: string; name: string; title: string | null };

export function EditJobDialog({
  open,
  onOpenChange,
  job,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: JobInput;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: job.title,
    client_id: job.client_id,
    location: job.location ?? "",
    employment_type: job.employment_type ?? "full_time",
    description: job.description ?? "",
    reference: job.reference ?? "",
  });
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [selectedHmIds, setSelectedHmIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  const loadContacts = async (clientId: string) => {
    const { data, error } = await supabase
      .from("client_contacts")
      .select("id, name, title")
      .eq("client_id", clientId)
      .order("name");
    if (error) {
      toast.error(error.message);
      setContacts([]);
      return;
    }
    setContacts((data as ContactOpt[]) ?? []);
  };

  useEffect(() => {
    if (open) {
      setForm({
        title: job.title,
        client_id: job.client_id,
        location: job.location ?? "",
        employment_type: job.employment_type ?? "full_time",
        description: job.description ?? "",
        reference: job.reference ?? "",
      });
      setNewClientOpen(false);
      setNewClientName("");
      (async () => {
        const [clientsRes, hmRes] = await Promise.all([
          supabase
            .from("clients")
            .select("id, name")
            .eq("workspace_id", job.workspace_id)
            .order("name"),
          supabase
            .from("job_hiring_managers")
            .select("contact_id, client_contacts(id, name, title)")
            .eq("job_id", job.id),
        ]);
        if (clientsRes.error) toast.error(clientsRes.error.message);
        setClients((clientsRes.data as ClientOpt[]) ?? []);

        const assigned = ((hmRes.data ?? []) as unknown as Array<{ client_contacts: ContactOpt | null }>)
          .map((r) => r.client_contacts)
          .filter((c): c is ContactOpt => !!c);
        setSelectedHmIds(assigned.map((c) => c.id));
        loadContacts(job.client_id);
      })();
    }
  }, [open, job]);

  const changeClient = (clientId: string) => {
    setForm({ ...form, client_id: clientId });
    setSelectedHmIds([]);
    loadContacts(clientId);
  };

  const toggleHiringManager = (id: string) => {
    setSelectedHmIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createClientInline = async () => {
    if (!user) return toast.error("You must be signed in to create a client.");
    const name = newClientName.trim();
    if (!name) return toast.error("Client name is required");

    setCreatingClient(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({ workspace_id: job.workspace_id, name, created_by: user.id })
      .select("id, name")
      .single();
    setCreatingClient(false);

    if (error || !data) return toast.error(error?.message ?? "Failed to create client");

    setClients((prev) => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((current) => ({ ...current, client_id: data.id }));
    setSelectedHmIds([]);
    setContacts([]);
    setNewClientName("");
    setNewClientOpen(false);
    toast.success("Client created.");
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.client_id) return toast.error("Client is required");
    setSaving(true);
    const { error } = await supabase
      .from("jobs")
      .update({
        client_id: form.client_id,
        title: form.title.trim(),
        location: form.location.trim() || null,
        employment_type: form.employment_type || null,
        description: form.description.trim() || null,
        reference: form.reference.trim() || null,
      })
      .eq("id", job.id);
    if (!error) {
      const { error: deleteHmError } = await supabase
        .from("job_hiring_managers")
        .delete()
        .eq("job_id", job.id);
      if (deleteHmError) {
        setSaving(false);
        return toast.error(deleteHmError.message);
      }

      if (selectedHmIds.length > 0) {
        const { error: insertHmError } = await supabase
          .from("job_hiring_managers")
          .insert(selectedHmIds.map((contactId) => ({ job_id: job.id, contact_id: contactId })));
        if (insertHmError) {
          setSaving(false);
          return toast.error(insertHmError.message);
        }
      }
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Job updated.");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Edit job</DialogTitle></DialogHeader>
        <form onSubmit={onSave} className="space-y-4">
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
                onClick={() => setNewClientOpen((value) => !value)}
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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createClientInline();
                    }
                  }}
                />
                <Button type="button" onClick={createClientInline} disabled={creatingClient || !newClientName.trim()}>
                  {creatingClient ? "Adding…" : "Add"}
                </Button>
              </div>
            ) : clients.length === 0 ? (
              <p className="text-xs text-muted-foreground">No clients available in this workspace. Use New client to add one.</p>
            ) : (
              <Select value={form.client_id} onValueChange={changeClient}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Job ID</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
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
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Hiring managers</Label>
            {!form.client_id ? (
              <p className="text-xs text-muted-foreground">Select a client first.</p>
            ) : contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts on this client yet. Add them on the client page.</p>
            ) : (
              <>
                <Select value="" onValueChange={toggleHiringManager}>
                  <SelectTrigger><SelectValue placeholder="Add hiring manager…" /></SelectTrigger>
                  <SelectContent>
                    {contacts
                      .filter((contact) => !selectedHmIds.includes(contact.id))
                      .map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}{contact.title ? ` — ${contact.title}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedHmIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedHmIds.map((id) => {
                      const contact = contacts.find((x) => x.id === id);
                      if (!contact) return null;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {contact.name}
                          <button type="button" onClick={() => toggleHiringManager(id)} aria-label={`Remove ${contact.name}`}>
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.client_id}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
