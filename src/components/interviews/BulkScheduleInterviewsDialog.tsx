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
import { Card } from "@/components/ui/card";
import { CalendarPlus, Users2, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { RichTextEditor, textToHtml, htmlToText } from "@/components/ui/rich-text-editor";
import { toast } from "sonner";

type Member = { user_id: string; display_name: string };
type Stage = { id: string; key: string; label: string };
type Template = { id: string; name: string };

type CandidateRow = {
  jobCandidateId: string;
  candidateId: string;
  name: string;
  email: string | null;
  jobTitle: string;
  stageId: string | null;
};

type Override = {
  interviewerIds: string[]; // when null/empty, fall back to defaults
  duration: number | null;
  stageId: string | null;
  expanded: boolean;
};

const DEFAULT_BODY = `Hi {{candidate_name}},

We'd love to chat about the {{job_title}} role. Please pick a time that works for you using this link:
{{schedule_link}}

Looking forward to it.`;

export function BulkScheduleInterviewsDialog({
  open, onOpenChange, jobCandidateIds, defaultStageId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobCandidateIds: string[];
  defaultStageId?: string | null;
  onCreated?: () => void;
}) {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [defaultInterviewers, setDefaultInterviewers] = useState<string[]>([]);
  const [defaultDuration, setDefaultDuration] = useState(45);
  const [defaultStage, setDefaultStage] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("none");
  const [subject, setSubject] = useState<string>("Schedule your interview — {{job_title}}");
  const [bodyHtml, setBodyHtml] = useState<string>(textToHtml(DEFAULT_BODY));
  const [sendToCandidate, setSendToCandidate] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !currentWorkspaceId || jobCandidateIds.length === 0) return;
    (async () => {
      const [memRes, stRes, tplRes, jcRes] = await Promise.all([
        supabase.from("workspace_members").select("user_id, role").eq("workspace_id", currentWorkspaceId).neq("role", "hiring_manager"),
        supabase.from("workspace_pipeline_stages").select("id, key, label").eq("workspace_id", currentWorkspaceId).order("position"),
        supabase.from("templates").select("id, name").eq("workspace_id", currentWorkspaceId),
        supabase.from("job_candidates").select("id, candidate_id, stage, candidates(full_name, email), jobs(title)").in("id", jobCandidateIds),
      ]);
      const ids = (memRes.data ?? []).map((m: any) => m.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
      setMembers(ids.map((id) => ({ user_id: id, display_name: byId.get(id) ?? "Member" })));
      const stageRows = (stRes.data ?? []) as Stage[];
      setStages(stageRows);
      setTemplates((tplRes.data ?? []) as Template[]);

      const stageMap = new Map(stageRows.map((s) => [s.key, s.id]));
      const rows: CandidateRow[] = ((jcRes.data ?? []) as any[]).map((r) => ({
        jobCandidateId: r.id,
        candidateId: r.candidate_id,
        name: r.candidates?.full_name ?? "Candidate",
        email: r.candidates?.email ?? null,
        jobTitle: r.jobs?.title ?? "",
        stageId: stageMap.get(r.stage) ?? null,
      }));
      setCandidates(rows);

      // Initialise overrides
      const init: Record<string, Override> = {};
      for (const r of rows) init[r.jobCandidateId] = { interviewerIds: [], duration: null, stageId: r.stageId, expanded: false };
      setOverrides(init);

      // Default stage: use provided default, else first interview stage, else first stage
      if (defaultStageId) setDefaultStage(defaultStageId);
      else {
        const interview = stageRows.find((s) => /interview/i.test(s.label) || /interview/i.test(s.key));
        setDefaultStage(interview?.id ?? stageRows[0]?.id ?? "");
      }
    })();
  }, [open, currentWorkspaceId, jobCandidateIds, defaultStageId]);

  const allEmails = useMemo(() => candidates.filter((c) => !!c.email).length, [candidates]);

  function toggleDefaultInterviewer(id: string, v: boolean) {
    setDefaultInterviewers((prev) => v ? [...prev, id] : prev.filter((x) => x !== id));
  }
  function toggleOverrideInterviewer(jcId: string, id: string, v: boolean) {
    setOverrides((prev) => {
      const o = prev[jcId];
      const list = o?.interviewerIds ?? [];
      const next = v ? Array.from(new Set([...list, id])) : list.filter((x) => x !== id);
      return { ...prev, [jcId]: { ...o, interviewerIds: next } };
    });
  }
  function setOverrideDuration(jcId: string, n: number | null) {
    setOverrides((prev) => ({ ...prev, [jcId]: { ...prev[jcId], duration: n } }));
  }
  function setOverrideStage(jcId: string, stageId: string) {
    setOverrides((prev) => ({ ...prev, [jcId]: { ...prev[jcId], stageId } }));
  }
  function toggleExpanded(jcId: string) {
    setOverrides((prev) => ({ ...prev, [jcId]: { ...prev[jcId], expanded: !prev[jcId]?.expanded } }));
  }

  async function loadTemplate(id: string) {
    setTemplateId(id);
    if (id === "none") {
      setSubject("Schedule your interview — {{job_title}}");
      setBodyHtml(textToHtml(DEFAULT_BODY));
      return;
    }
    const { data: t } = await supabase.from("templates").select("name, content").eq("id", id).maybeSingle();
    if (t) {
      setSubject(t.name);
      // Detect HTML content in template body — fall back to text→html conversion.
      const looksHtml = /<\w+[^>]*>/.test(t.content ?? "");
      setBodyHtml(looksHtml ? (t.content ?? "") : textToHtml(t.content ?? ""));
    }
  }

  function applyVars(input: string, vars: Record<string, string>): string {
    return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  }

  async function submit() {
    if (!user || !currentWorkspaceId) return;
    if (defaultInterviewers.length === 0 && Object.values(overrides).every((o) => (o?.interviewerIds?.length ?? 0) === 0)) {
      toast.error("Pick interviewers (default panel or per-candidate)");
      return;
    }
    setBusy(true);
    let created = 0, failed = 0, sent = 0;
    for (const c of candidates) {
      const o = overrides[c.jobCandidateId];
      const interviewerIds = (o?.interviewerIds?.length ? o.interviewerIds : defaultInterviewers);
      if (interviewerIds.length === 0) { failed++; continue; }
      const duration = o?.duration ?? defaultDuration;
      const stageId = o?.stageId ?? defaultStage ?? null;

      const { data, error } = await supabase.functions.invoke("interview-scheduling", {
        body: {
          mode: "create",
          jobCandidateId: c.jobCandidateId,
          interviewerIds,
          durationMinutes: duration,
          stageId: stageId || null,
        },
      });
      if (error || !data?.ok) { failed++; continue; }
      created++;
      const token = data.schedule_token as string;
      const link = `${window.location.origin}/schedule/${token}`;

      if (sendToCandidate && c.email) {
        const vars = { candidate_name: c.name, job_title: c.jobTitle, schedule_link: link };
        const subj = applyVars(subject || "Schedule your interview", vars);
        const renderedHtml = applyVars(bodyHtml, { ...vars, schedule_link: `<a href="${link}">${link}</a>` });
        const renderedText = applyVars(htmlToText(bodyHtml), vars);
        const { error: qErr } = await supabase.from("outbound_email_queue").insert({
          workspace_id: currentWorkspaceId,
          job_candidate_id: c.jobCandidateId,
          template_id: templateId !== "none" ? templateId : null,
          payload: { to: c.email, subject: subj, body: renderedText, body_html: renderedHtml },
          status: "pending",
        });
        if (!qErr) sent++;
      }
    }
    setBusy(false);
    if (created > 0) toast.success(`Created ${created} interview${created === 1 ? "" : "s"}${sent ? ` • ${sent} email${sent === 1 ? "" : "s"} queued` : ""}.`);
    if (failed > 0) toast.error(`${failed} candidate${failed === 1 ? "" : "s"} skipped (no interviewers picked).`);
    onCreated?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" /> Bulk schedule interviews
          </DialogTitle>
          <DialogDescription>
            Create scheduling links for {candidates.length} candidate{candidates.length === 1 ? "" : "s"}. Set defaults below, then override per candidate as needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Defaults */}
          <Card className="p-4 space-y-4">
            <div className="text-sm font-medium flex items-center gap-2"><Users2 className="h-4 w-4" /> Defaults for all candidates</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Stage</Label>
                <Select value={defaultStage} onValueChange={setDefaultStage}>
                  <SelectTrigger><SelectValue placeholder="Pick a stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" min={15} step={15} value={defaultDuration} onChange={(e) => setDefaultDuration(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default interviewer panel</Label>
              <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                {members.length === 0 && <p className="text-xs text-muted-foreground col-span-2">No workspace members available.</p>}
                {members.map((m) => (
                  <label key={m.user_id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={defaultInterviewers.includes(m.user_id)}
                      onCheckedChange={(v) => toggleDefaultInterviewer(m.user_id, !!v)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </div>
            </div>
          </Card>

          {/* Per-candidate overrides */}
          <div>
            <div className="text-sm font-medium mb-2">Candidates ({candidates.length})</div>
            <div className="space-y-2">
              {candidates.map((c) => {
                const o = overrides[c.jobCandidateId];
                const usingDefault = (o?.interviewerIds?.length ?? 0) === 0;
                return (
                  <Card key={c.jobCandidateId} className="p-3">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3"
                      onClick={() => toggleExpanded(c.jobCandidateId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {o?.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <span className="text-xs text-muted-foreground truncate">— {c.jobTitle}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!c.email && <Badge variant="outline" className="text-[10px]">No email</Badge>}
                        <Badge variant={usingDefault ? "secondary" : "default"} className="text-[10px]">
                          {usingDefault ? "Default panel" : `${o.interviewerIds.length} custom`}
                        </Badge>
                      </div>
                    </button>
                    {o?.expanded && (
                      <div className="mt-3 pt-3 border-t space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Stage (override)</Label>
                            <Select value={o.stageId ?? ""} onValueChange={(v) => setOverrideStage(c.jobCandidateId, v)}>
                              <SelectTrigger><SelectValue placeholder="Use default" /></SelectTrigger>
                              <SelectContent>
                                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Duration (override)</Label>
                            <Input
                              type="number" min={15} step={15}
                              placeholder={String(defaultDuration)}
                              value={o.duration ?? ""}
                              onChange={(e) => setOverrideDuration(c.jobCandidateId, e.target.value ? Number(e.target.value) : null)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Interviewers (override — leave empty to use default panel)</Label>
                          <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-36 overflow-y-auto">
                            {members.map((m) => (
                              <label key={m.user_id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={o.interviewerIds.includes(m.user_id)}
                                  onCheckedChange={(v) => toggleOverrideInterviewer(c.jobCandidateId, m.user_id, !!v)}
                                />
                                {m.display_name}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Email */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Send invitation email</div>
                <div className="text-xs text-muted-foreground">{allEmails} of {candidates.length} candidates have an email on file.</div>
              </div>
              <Switch checked={sendToCandidate} onCheckedChange={setSendToCandidate} />
            </div>
            {sendToCandidate && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-1">
                    <Label className="text-xs">Template</Label>
                    <Select value={templateId} onValueChange={loadTemplate}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default invitation</SelectItem>
                        {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-1">
                    <Label className="text-xs">Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Message</Label>
                  <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders: <code>{"{{candidate_name}}"}</code>, <code>{"{{job_title}}"}</code>, <code>{"{{schedule_link}}"}</code>
                  </p>
                </div>
              </>
            )}
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            <Copy className="h-4 w-4 mr-1" /> {busy ? "Creating…" : `Create ${candidates.length} interview${candidates.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
