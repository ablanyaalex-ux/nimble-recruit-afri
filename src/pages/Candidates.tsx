import { useEffect, useState } from "react";
import { Plus, Users, Upload } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  headline: string | null;
  resume_path: string | null;
};

export default function Candidates() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    headline: "",
    location: "",
    linkedin_url: "",
    notes: "",
  });
  const [resume, setResume] = useState<File | null>(null);

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("candidates")
      .select("id, full_name, email, headline, resume_path")
      .eq("workspace_id", currentWorkspaceId)
      .order("created_at", { ascending: false });
    if (data) setCandidates(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentWorkspaceId || !form.full_name.trim()) {
      return toast.error("Name is required");
    }
    setSubmitting(true);
    const { data: cand, error } = await supabase
      .from("candidates")
      .insert({
        workspace_id: currentWorkspaceId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        headline: form.headline.trim() || null,
        location: form.location.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !cand) {
      setSubmitting(false);
      return toast.error(error?.message ?? "Failed");
    }

    if (resume) {
      const path = `${currentWorkspaceId}/${cand.id}/${resume.name}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, resume, { upsert: true });
      if (upErr) {
        toast.error(`Resume upload failed: ${upErr.message}`);
      } else {
        await supabase.from("candidates").update({ resume_path: path }).eq("id", cand.id);
      }
    }

    setSubmitting(false);
    toast.success("Candidate added.");
    setOpen(false);
    setForm({ full_name: "", email: "", phone: "", headline: "", location: "", linkedin_url: "", notes: "" });
    setResume(null);
    refresh();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="Candidates"
        description="Your shortlists and the people moving through pipelines."
        actions={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> New candidate</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New candidate</DialogTitle></DialogHeader>
                <form onSubmit={onCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Headline</Label>
                    <Input placeholder="Senior Backend Engineer" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>LinkedIn URL</Label>
                    <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Resume (PDF/DOC)</Label>
                    <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Add"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : candidates.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-display text-xl">No candidates yet</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {candidates.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium">{c.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.headline ?? c.email ?? "—"}
                </div>
              </div>
              {c.resume_path && <Upload className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
