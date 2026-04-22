import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CANDIDATE_SOURCES } from "@/lib/permissions";
import { usePipelineStages } from "@/hooks/usePipelineStages";

type Props = {
  jobId: string;
  workspaceId: string;
  onAdded: () => void;
};

type CandidateOpt = { id: string; full_name: string };

export function AddCandidateDialog({ jobId, workspaceId, onAdded }: Props) {
  const { user } = useAuth();
  const { stages } = usePipelineStages(workspaceId);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<CandidateOpt[]>([]);
  const [pick, setPick] = useState("");
  const [stage, setStage] = useState<string>("application");

  // Default to first stage when stages load
  useEffect(() => {
    if (stages.length > 0 && !stages.some((s) => s.key === stage)) {
      setStage(stages[0].key);
    }
  }, [stages]);

  // New candidate form
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    headline: "",
    source: "",
    notes: "",
  });
  const [resume, setResume] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [optsRes, jcRes] = await Promise.all([
        supabase.from("candidates").select("id, full_name").eq("workspace_id", workspaceId).order("full_name"),
        supabase.from("job_candidates").select("candidate_id").eq("job_id", jobId),
      ]);
      const inPipe = new Set((jcRes.data ?? []).map((r) => r.candidate_id));
      setOpts((optsRes.data ?? []).filter((c) => !inPipe.has(c.id)));
    })();
  }, [open, workspaceId, jobId]);

  const reset = () => {
    setPick("");
    setForm({ full_name: "", email: "", phone: "", headline: "", source: "", notes: "" });
    setResume(null);
  };

  const addExisting = async () => {
    if (!user || !pick) return;
    const { error } = await supabase.from("job_candidates").insert({
      job_id: jobId,
      candidate_id: pick,
      added_by: user.id,
      stage: "application",
    });
    if (error) return toast.error(error.message);
    toast.success("Added to pipeline.");
    reset();
    setOpen(false);
    onAdded();
  };

  const addNew = async () => {
    if (!user || !form.full_name.trim()) return;
    setSaving(true);
    try {
      const { data: cand, error: cErr } = await supabase
        .from("candidates")
        .insert({
          workspace_id: workspaceId,
          created_by: user.id,
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          headline: form.headline.trim() || null,
          source: form.source || null,
          notes: form.notes.trim() || null,
        } as any)
        .select("id")
        .single();
      if (cErr || !cand) throw cErr ?? new Error("Failed to create candidate");

      let resumePath: string | null = null;
      if (resume) {
        const ext = resume.name.split(".").pop() ?? "pdf";
        const path = `${workspaceId}/${cand.id}/resume.${ext}`;
        const { error: upErr } = await supabase.storage.from("resumes").upload(path, resume, { upsert: true });
        if (upErr) throw upErr;
        resumePath = path;
        await supabase.from("candidates").update({ resume_path: resumePath }).eq("id", cand.id);
      }

      const { error: jcErr } = await supabase.from("job_candidates").insert({
        job_id: jobId,
        candidate_id: cand.id,
        added_by: user.id,
        stage: "application",
      });
      if (jcErr) throw jcErr;

      toast.success("Candidate added.");
      reset();
      setOpen(false);
      onAdded();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Add candidate</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add candidate to pipeline</DialogTitle></DialogHeader>
        <Tabs defaultValue="new">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="new">New candidate</TabsTrigger>
            <TabsTrigger value="existing">Existing</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label className="text-xs">Full name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Headline</Label>
              <Input
                placeholder="Senior backend engineer at…"
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue placeholder="Where did they come from?" /></SelectTrigger>
                <SelectContent>
                  {CANDIDATE_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resume (PDF)</Label>
              <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button onClick={addNew} disabled={saving || !form.full_name.trim()}>
                {saving ? "Saving…" : "Add to pipeline"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="existing" className="space-y-3 mt-4">
            {opts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No more candidates available in this workspace.</p>
            ) : (
              <>
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger><SelectValue placeholder="Choose candidate" /></SelectTrigger>
                  <SelectContent>
                    {opts.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DialogFooter><Button onClick={addExisting} disabled={!pick}>Add</Button></DialogFooter>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
