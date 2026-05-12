import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Sparkles, CalendarPlus, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

type Member = { user_id: string; display_name: string };
type Schedule = {
  id: string;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number;
  interviewer_ids: string[];
  schedule_token: string;
};

export function InterviewPanelDialog({
  open, onOpenChange, jobCandidateId,
}: { open: boolean; onOpenChange: (v: boolean) => void; jobCandidateId: string | null }) {
  const { currentWorkspaceId } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(45);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [creating, setCreating] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [summarizing, setSummarizing] = useState(false);

  async function load() {
    if (!currentWorkspaceId || !jobCandidateId) return;
    const { data: mems } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", currentWorkspaceId)
      .neq("role", "hiring_manager");
    const ids = (mems ?? []).map((m: any) => m.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    setMembers(ids.map((id) => ({ user_id: id, display_name: byId.get(id) ?? "Member" })));

    const { data: sch } = await supabase
      .from("interview_schedules")
      .select("id, status, scheduled_at, duration_minutes, interviewer_ids, schedule_token")
      .eq("job_candidate_id", jobCandidateId)
      .order("created_at", { ascending: false });
    setSchedules((sch ?? []) as Schedule[]);
  }
  useEffect(() => { if (open) load(); }, [open, currentWorkspaceId, jobCandidateId]);

  async function create() {
    if (selected.length === 0) { toast.error("Select at least one interviewer"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("interview-scheduling", {
      body: { mode: "create", jobCandidateId, interviewerIds: selected, durationMinutes: duration },
    });
    setCreating(false);
    if (error || !data?.ok) { toast.error(error?.message ?? "Failed"); return; }
    toast.success("Interview created. Share the scheduling link with the candidate.");
    setSelected([]);
    await load();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/schedule/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function summarize(interviewId: string) {
    if (!transcript.trim()) { toast.error("Paste a transcript first"); return; }
    setSummarizing(true);
    setSummary(null);
    const { data, error } = await supabase.functions.invoke("summarize-interview", {
      body: { interviewId, transcript },
    });
    setSummarizing(false);
    if (error || !data?.ok) { toast.error(error?.message ?? data?.error ?? "Failed"); return; }
    setSummary(data.summary);
    toast.success("AI summary generated");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interview panel</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Schedule a new interview</h3>
          <div className="border rounded-md p-3 space-y-3">
            <div>
              <Label className="text-xs">Interviewers</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {members.map((m) => (
                  <label key={m.user_id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(m.user_id)}
                      onCheckedChange={(v) => setSelected(v ? [...selected, m.user_id] : selected.filter((x) => x !== m.user_id))}
                    />
                    {m.display_name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-24" />
              </div>
              <Button onClick={create} disabled={creating}>
                <CalendarPlus className="h-4 w-4 mr-1.5" /> {creating ? "Creating..." : "Create & get link"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Interviews</h3>
          {schedules.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {schedules.map((s) => (
            <Card key={s.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <Badge variant={s.status === "scheduled" ? "default" : "secondary"}>{s.status.replace("_", " ")}</Badge>{" "}
                  <span className="text-muted-foreground">
                    {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "Awaiting candidate"} • {s.duration_minutes} min
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(s.schedule_token)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/interviews/${s.id}/scorecard/${s.interviewer_ids[0]}`}>
                      <ClipboardList className="h-3.5 w-3.5 mr-1" /> Scorecards
                    </Link>
                  </Button>
                  <Button size="sm" variant={activeId === s.id ? "default" : "ghost"} onClick={() => { setActiveId(activeId === s.id ? null : s.id); setSummary(null); }}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> AI summary
                  </Button>
                </div>
              </div>

              {activeId === s.id && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs">Paste interview transcript</Label>
                  <Textarea rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Interviewer: ... Candidate: ..." />
                  <Button size="sm" onClick={() => summarize(s.id)} disabled={summarizing}>
                    {summarizing ? "Analyzing..." : "Generate AI summary"}
                  </Button>
                  {summary && (
                    <div className="text-sm space-y-2 mt-2 p-3 rounded-md bg-muted/30">
                      <p><strong>Executive summary:</strong> {summary.executive_summary}</p>
                      {summary.technical_alignment && (
                        <p><strong>Technical:</strong> {summary.technical_alignment.score}/10 — {summary.technical_alignment.rationale}</p>
                      )}
                      {summary.culture_fit && <p><strong>Culture fit:</strong> {summary.culture_fit}</p>}
                      {Array.isArray(summary.red_flags) && summary.red_flags.length > 0 && (
                        <div><strong>Red flags:</strong>
                          <ul className="list-disc pl-5">{summary.red_flags.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {Array.isArray(summary.suggested_questions) && (
                        <div><strong>Suggested follow-ups:</strong>
                          <ul className="list-disc pl-5">{summary.suggested_questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
