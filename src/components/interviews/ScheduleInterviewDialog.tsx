import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, CalendarSearch, Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

type Member = { user_id: string; display_name: string };
type Stage = { id: string; key: string; label: string };
type Template = { id: string; name: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleInterviewDialog({
  open, onOpenChange, jobCandidateId, defaultStageId, onCreated, existingInterviewId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobCandidateId: string | null;
  defaultStageId?: string | null;
  onCreated?: () => void;
  existingInterviewId?: string | null;
}) {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedInterviewers, setSelectedInterviewers] = useState<string[]>([]);
  const [stageId, setStageId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("none");
  const [duration, setDuration] = useState(45);
  const [sendToCandidate, setSendToCandidate] = useState(true);
  const [creating, setCreating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSlots, setPreviewSlots] = useState<string[] | null>(null);
  const isReschedule = !!existingInterviewId;

  useEffect(() => {
    if (!open || !currentWorkspaceId) return;
    (async () => {
      const [memRes, stRes, tplRes] = await Promise.all([
        supabase.from("workspace_members").select("user_id, role").eq("workspace_id", currentWorkspaceId).neq("role", "hiring_manager"),
        supabase.from("workspace_pipeline_stages").select("id, key, label").eq("workspace_id", currentWorkspaceId).order("position"),
        supabase.from("templates").select("id, name").eq("workspace_id", currentWorkspaceId),
      ]);
      const ids = (memRes.data ?? []).map((m: any) => m.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
      setMembers(ids.map((id) => ({ user_id: id, display_name: byId.get(id) ?? "Member" })));
      setStages((stRes.data ?? []) as Stage[]);
      setTemplates((tplRes.data ?? []) as Template[]);

      if (isReschedule && existingInterviewId) {
        // Load existing interview data
        const { data: iv } = await supabase
          .from("interview_schedules")
          .select("interviewer_ids, duration_minutes, stage_id")
          .eq("id", existingInterviewId)
          .maybeSingle();
        if (iv) {
          setSelectedInterviewers((iv.interviewer_ids ?? []) as string[]);
          setDuration(iv.duration_minutes ?? 45);
          setStageId(iv.stage_id ?? "");
          return;
        }
      }

      if (defaultStageId) setStageId(defaultStageId);
      else {
        const interview = (stRes.data ?? []).find((s: any) => /interview/i.test(s.label));
        setStageId(interview?.id ?? (stRes.data?.[0]?.id ?? ""));
      }
    })();
  }, [open, currentWorkspaceId, defaultStageId, isReschedule, existingInterviewId]);

  function toggleInterviewer(id: string, v: boolean) {
    setSelectedInterviewers((prev) => v ? [...prev, id] : prev.filter((x) => x !== id));
    setPreviewSlots(null);
  }

  async function previewAvailability() {
    if (selectedInterviewers.length === 0) { toast.error("Select interviewers first"); return; }
    setPreviewLoading(true);
    setPreviewSlots(null);
    const { data: avail } = await supabase
      .from("interviewer_availability")
      .select("user_id, day_of_week, start_time, end_time, buffer_minutes")
      .in("user_id", selectedInterviewers);
    const fromIso = new Date().toISOString();
    const toIso = new Date(Date.now() + 14 * 86400_000).toISOString();
    const { data: existing } = await supabase
      .from("interview_schedules")
      .select("scheduled_at, duration_minutes, interviewer_ids")
      .eq("status", "scheduled")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso);

    const buffer = Math.max(0, ...(avail ?? []).map((a: any) => Number(a.buffer_minutes ?? 15)));
    const availByUser = new Map<string, Map<number, Array<[number, number]>>>();
    for (const a of avail ?? []) {
      if (!availByUser.has(a.user_id)) availByUser.set(a.user_id, new Map());
      const m = availByUser.get(a.user_id)!;
      if (!m.has(a.day_of_week)) m.set(a.day_of_week, []);
      const [sh, sm] = a.start_time.split(":").map(Number);
      const [eh, em] = a.end_time.split(":").map(Number);
      m.get(a.day_of_week)!.push([sh * 60 + sm, eh * 60 + em]);
    }

    const slots: string[] = [];
    const now = Date.now();
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    for (let d = 0; d < 14; d++) {
      const dayDate = new Date(startDay.getTime() + d * 86400_000);
      const dow = dayDate.getDay();
      for (let mins = 0; mins < 24 * 60; mins += 30) {
        const slotStart = new Date(dayDate.getTime() + mins * 60_000);
        const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
        if (slotStart.getTime() < now + 60 * 60_000) continue;
        let allFree = true;
        for (const uid of selectedInterviewers) {
          const dayWindows = availByUser.get(uid)?.get(dow) ?? [];
          const fits = dayWindows.some(([s, e]) => mins >= s && mins + duration <= e);
          if (!fits) { allFree = false; break; }
        }
        if (!allFree) continue;
        const conflict = (existing ?? []).some((b: any) => {
          if (!b.scheduled_at) return false;
          const bs = new Date(b.scheduled_at).getTime() - buffer * 60_000;
          const be = bs + (b.duration_minutes ?? 45) * 60_000 + buffer * 60_000 * 2;
          const overlaps = slotStart.getTime() < be && slotEnd.getTime() > bs;
          if (!overlaps) return false;
          return (b.interviewer_ids ?? []).some((u: string) => selectedInterviewers.includes(u));
        });
        if (conflict) continue;
        slots.push(slotStart.toISOString());
      }
    }
    setPreviewLoading(false);
    setPreviewSlots(slots);
    if (slots.length === 0) toast.error("No overlapping slots in the next 14 days. Check interviewer availability.");
    else toast.success(`${slots.length} open slots found.`);
  }

  const slotsByDay = useMemo(() => {
    if (!previewSlots) return [];
    const map = new Map<string, string[]>();
    for (const s of previewSlots) {
      const d = new Date(s);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).slice(0, 7);
  }, [previewSlots]);

  async function submit() {
    if (!jobCandidateId || !user || !currentWorkspaceId) return;
    if (selectedInterviewers.length === 0) { toast.error("Select at least one interviewer"); return; }
    setCreating(true);

    let data: any, error: any;
    if (isReschedule && existingInterviewId) {
      const res = await supabase.functions.invoke("interview-scheduling", {
        body: {
          mode: "reschedule",
          interviewId: existingInterviewId,
          interviewerIds: selectedInterviewers,
          durationMinutes: duration,
          stageId: stageId || null,
        },
      });
      data = res.data; error = res.error;
    } else {
      const res = await supabase.functions.invoke("interview-scheduling", {
        body: {
          mode: "create",
          jobCandidateId,
          interviewerIds: selectedInterviewers,
          durationMinutes: duration,
          stageId: stageId || null,
        },
      });
      data = res.data; error = res.error;
    }

    if (error || !data?.ok) {
      setCreating(false);
      toast.error((error as any)?.message ?? data?.error ?? "Failed to save");
      return;
    }
    const token = data.schedule_token as string;
    const link = `${window.location.origin}/schedule/${token}`;

    if (sendToCandidate) {
      const { data: jc } = await supabase
        .from("job_candidates")
        .select("candidates(full_name, email), jobs(title)")
        .eq("id", jobCandidateId)
        .maybeSingle();
      const email = (jc as any)?.candidates?.email;
      const candName = (jc as any)?.candidates?.full_name ?? "Candidate";
      const jobTitle = (jc as any)?.jobs?.title ?? "the role";
      if (email) {
        let subject = isReschedule
          ? `Rescheduled: pick a new time — ${jobTitle}`
          : `Schedule your interview — ${jobTitle}`;
        let body = isReschedule
          ? `Hi ${candName},\n\nWe need to reschedule your interview for ${jobTitle}. Please pick a new time using this link:\n${link}\n\nWe look forward to speaking with you.`
          : `Hi ${candName},\n\nPlease pick a time for your interview using this link:\n${link}\n\nWe look forward to speaking with you.`;
        if (templateId && templateId !== "none") {
          const tpl = templates.find((t) => t.id === templateId);
          const { data: tplFull } = await supabase.from("templates").select("content").eq("id", templateId).maybeSingle();
          const content = (tplFull as any)?.content ?? body;
          body = content
            .replace(/\{\{\s*candidate_name\s*\}\}/g, candName)
            .replace(/\{\{\s*job_title\s*\}\}/g, jobTitle)
            .replace(/\{\{\s*schedule_link\s*\}\}/g, link);
          if (tpl?.name) subject = `${tpl.name} — ${jobTitle}`;
        }
        await supabase.from("outbound_email_queue").insert({
          workspace_id: currentWorkspaceId,
          job_candidate_id: jobCandidateId,
          template_id: templateId !== "none" ? templateId : null,
          payload: { to: email, subject, body },
          status: "pending",
        });
        toast.success(isReschedule ? "Reschedule email sent to candidate." : "Scheduling link sent to candidate.");
      } else {
        toast.warning("No candidate email on file — link not sent.");
      }
    } else {
      navigator.clipboard.writeText(link).catch(() => {});
      toast.success(isReschedule ? "Interview updated. Link copied to clipboard." : "Interview created. Link copied to clipboard.");
    }
    setCreating(false);
    setSelectedInterviewers([]);
    setPreviewSlots(null);
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" /> {isReschedule ? "Reschedule interview" : "Schedule interview"}</DialogTitle>
          <DialogDescription>{isReschedule ? "Update the interview round and send the candidate a new self-scheduling link." : "Set up an interview round and send the candidate a self-scheduling link."}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Pick a stage" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duration (min)</Label>
              <Input type="number" min={15} step={15} value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setPreviewSlots(null); }} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Interviewers</Label>
            <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-44 overflow-y-auto">
              {members.length === 0 && <p className="text-xs text-muted-foreground col-span-2">No workspace members available.</p>}
              {members.map((m) => (
                <label key={m.user_id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedInterviewers.includes(m.user_id)}
                    onCheckedChange={(v) => toggleInterviewer(m.user_id, !!v)}
                  />
                  {m.display_name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Invitation email template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default invitation</SelectItem>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Placeholders: <code>{"{{candidate_name}}"}</code>, <code>{"{{job_title}}"}</code>, <code>{"{{schedule_link}}"}</code>
            </p>
          </div>

          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <div className="text-sm font-medium">Send scheduling link to candidate</div>
              <div className="text-xs text-muted-foreground">Email goes out immediately. If off, link is copied to your clipboard.</div>
            </div>
            <Switch checked={sendToCandidate} onCheckedChange={setSendToCandidate} />
          </div>

          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2">
                <CalendarSearch className="h-4 w-4" /> Availability preview
              </div>
              <Button size="sm" variant="outline" onClick={previewAvailability} disabled={previewLoading || selectedInterviewers.length === 0}>
                {previewLoading ? "Computing…" : "Preview availability"}
              </Button>
            </div>
            {previewSlots === null && (
              <p className="text-xs text-muted-foreground">Pick interviewers and click preview to see overlapping open slots.</p>
            )}
            {previewSlots && previewSlots.length === 0 && (
              <p className="text-xs text-destructive">No overlapping availability in the next 14 days.</p>
            )}
            {previewSlots && previewSlots.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{previewSlots.length} slots over the next 14 days. First 7 days shown:</p>
                <div className="grid grid-cols-7 gap-1">
                  {slotsByDay.map(([day, slots]) => {
                    const d = new Date(day);
                    return (
                      <div key={day} className="border rounded-md p-2 text-center">
                        <div className="text-[10px] uppercase text-muted-foreground">{DAYS[d.getDay()]}</div>
                        <div className="text-xs font-medium">{d.getDate()}</div>
                        <Badge variant="secondary" className="mt-1 text-[10px]">{slots.length} slots</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={creating || selectedInterviewers.length === 0}>
            <LinkIcon className="h-4 w-4 mr-1" /> {creating ? "Saving…" : sendToCandidate ? (isReschedule ? "Update & send link" : "Create & send link") : (isReschedule ? "Update & copy link" : "Create & copy link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
