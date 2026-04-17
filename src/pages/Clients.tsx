import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { canEditWorkspace } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { z } from "zod";

type Client = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export default function Clients() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", industry: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, website, industry, notes")
      .eq("workspace_id", currentWorkspaceId)
      .order("name");
    if (!error && data) setClients(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentWorkspaceId) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSubmitting(true);
    const { error } = await supabase.from("clients").insert({
      workspace_id: currentWorkspaceId,
      name: parsed.data.name,
      website: parsed.data.website || null,
      industry: parsed.data.industry || null,
      notes: parsed.data.notes || null,
      created_by: user.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Client added.");
    setOpen(false);
    setForm({ name: "", website: "", industry: "", notes: "" });
    refresh();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="The companies you're recruiting for. Track contacts and hiring managers per client."
        actions={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New client</DialogTitle>
                  <DialogDescription>You can add hiring manager contacts after creating.</DialogDescription>
                </DialogHeader>
                <form onSubmit={onCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="c-name">Company name</Label>
                    <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="c-website">Website</Label>
                      <Input id="c-website" placeholder="acme.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-industry">Industry</Label>
                      <Input id="c-industry" placeholder="Fintech" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-notes">Notes</Label>
                    <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clients.length === 0 ? (
        <Card className="p-10 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-display text-xl">No clients yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {canEdit ? "Add your first client to start tracking jobs and contacts." : "Ask an owner or recruiter to add clients."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}`}>
              <Card className="p-5 hover:border-primary/40 transition-colors h-full">
                <div className="font-display text-lg leading-tight">{c.name}</div>
                {c.industry && (
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{c.industry}</div>
                )}
                {c.website && (
                  <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 truncate">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.website}</span>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
