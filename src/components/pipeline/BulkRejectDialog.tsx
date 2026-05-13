import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Template = { id: string; name: string; content: string };

export type BulkRejectCandidate = {
  candidate_id: string;
  full_name: string;
  email: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  candidates: BulkRejectCandidate[];
  onDone?: () => void;
};

const REASONS = [
  "Not enough relevant experience",
  "Missing required skills",
  "Salary expectations too high",
  "Location or work authorization mismatch",
  "Position filled",
  "Other",
];

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function BulkRejectDialog({ open, onOpenChange, workspaceId, candidates, onDone }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("blank");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [subject, setSubject] = useState("Update on your application");
  const [body, setBody] = useState("Hi {{candidate_name}},\n\nThank you for your interest. After review we won't be moving forward at this time.\n\nBest,\nThe Team");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreviewIdx(0);
    (async () => {
      const { data } = await supabase
        .from("templates")
        .select("id, name, content")
        .eq("workspace_id", workspaceId)
        .eq("type", "email")
        .order("updated_at", { ascending: false });
      setTemplates((data ?? []) as Template[]);
    })();
  }, [open, workspaceId]);

  const apply = (id: string) => {
    setTemplateId(id);
    if (id === "blank") return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.name);
    setBody(t.content);
  };

  const previewCand = candidates[previewIdx] ?? candidates[0];
  const previewVars = useMemo(
    () => ({ candidate_name: previewCand?.full_name ?? "", company_name: "", job_title: "" }),
    [previewCand]
  );

  const withEmail = candidates.filter((c) => !!c.email);
  const withoutEmail = candidates.length - withEmail.length;

  const submit = async () => {
    if (candidates.length === 0) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    const userId = u.user.id;

    let emailsLogged = 0;
    let rejectedCount = 0;

    for (const c of candidates) {
      // Mark all job_candidate rows for this candidate (in this workspace) as rejected
      const { data: jcRows } = await supabase
        .from("job_candidates")
        .select("id, job_id, jobs!inner(workspace_id)")
        .eq("candidate_id", c.candidate_id)
        .eq("rejected", false)
        .eq("jobs.workspace_id", workspaceId);

      for (const jc of (jcRows ?? []) as any[]) {
        const { error } = await supabase
          .from("job_candidates")
          .update({ rejected: true, rejected_at: new Date().toISOString(), rejected_by: userId, rejection_reason: reason })
          .eq("id", jc.id);
        if (!error) rejectedCount++;
      }

      if (!c.email) continue;

      const vars = { candidate_name: c.full_name, company_name: "", job_title: "" };
      const renderedSubject = render(subject, vars).trim();
      const renderedBody = render(body, vars).trim();
      if (!renderedSubject || !renderedBody) continue;

      // Pick a job_candidate_id to attach the thread to (first one if any)
      const firstJc = (jcRows ?? [])[0] as any | undefined;

      const { data: thread, error: tErr } = await supabase
        .from("communication_threads")
        .insert({
          workspace_id: workspaceId,
          subject: renderedSubject,
          channel: "email",
          candidate_id: c.candidate_id,
          job_candidate_id: firstJc?.id ?? null,
          participant_email: c.email,
          participant_name: c.full_name,
          created_by: userId,
        })
        .select("id")
        .single();
      if (tErr || !thread) continue;

      await supabase.from("messages").insert({
        thread_id: (thread as any).id,
        workspace_id: workspaceId,
        direction: "outbound",
        body: renderedBody,
        recipient_email: c.email,
        sender_user_id: userId,
      });

      // Activity entry per candidate (per pipeline if any) for the email
      if ((jcRows ?? []).length === 0) {
        await supabase.from("activity_logs").insert({
          workspace_id: workspaceId,
          candidate_id: c.candidate_id,
          actor_id: userId,
          action_type: "email_sent",
          to_value: c.email,
          metadata: { subject: renderedSubject, thread_id: (thread as any).id, bulk: true, reason },
        });
      } else {
        await supabase.from("activity_logs").insert(
          (jcRows as any[]).map((jc) => ({
            workspace_id: workspaceId,
            job_id: jc.job_id,
            job_candidate_id: jc.id,
            candidate_id: c.candidate_id,
            actor_id: userId,
            action_type: "email_sent",
            to_value: c.email,
            metadata: { subject: renderedSubject, thread_id: (thread as any).id, bulk: true, reason },
          }))
        );
      }
      emailsLogged++;
    }

    setBusy(false);
    toast.success(`Rejected ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}. ${emailsLogged} email${emailsLogged === 1 ? "" : "s"} logged.`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> Reject {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Send a rejection email and mark all of their pipelines as rejected.
            {withoutEmail > 0 && (
              <span className="block mt-1 text-amber-600">
                {withoutEmail} candidate{withoutEmail === 1 ? "" : "s"} without an email will be rejected silently.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email template</Label>
              <Select value={templateId} onValueChange={apply}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Default rejection</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Placeholders: <code>{"{{candidate_name}}"}</code>. Each candidate receives a personalized copy.
            </p>
          </div>

          {withEmail.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview</Label>
                <Select value={String(previewIdx)} onValueChange={(v) => setPreviewIdx(Number(v))}>
                  <SelectTrigger className="h-7 w-auto text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((c, i) => (
                      <SelectItem key={c.candidate_id} value={String(i)}>
                        {c.full_name}{c.email ? "" : " (no email)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm font-medium">{render(subject, previewVars)}</div>
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans">{render(body, previewVars)}</pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? "Processing…" : `Reject & send`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
