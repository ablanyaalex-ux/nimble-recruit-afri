import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";

type Template = { id: string; name: string; content: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  candidateId: string;
  jobCandidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  offerLink?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onSent?: () => void;
};

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function SendEmailDialog({
  open, onOpenChange, workspaceId, candidateId, jobCandidateId,
  candidateName, candidateEmail, jobTitle, offerLink, defaultSubject, defaultBody, onSent,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("blank");
  const [to, setTo] = useState(candidateEmail ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const vars = useMemo(() => ({
    candidate_name: candidateName,
    job_title: jobTitle,
    offer_link: offerLink ?? "",
    company_name: "",
    stage: "",
  }), [candidateName, jobTitle, offerLink]);

  useEffect(() => {
    if (!open) return;
    setTo(candidateEmail ?? "");
    setSubject(defaultSubject ?? "");
    setBody(defaultBody ?? "");
    setTemplateId("blank");
    (async () => {
      const { data } = await supabase
        .from("templates")
        .select("id, name, content")
        .eq("workspace_id", workspaceId)
        .eq("type", "email")
        .order("updated_at", { ascending: false });
      setTemplates((data ?? []) as Template[]);
    })();
  }, [open, workspaceId, candidateEmail, defaultSubject, defaultBody]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "blank") {
      setSubject("");
      setBody("");
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(render(tpl.name, vars));
    setBody(render(tpl.content, vars));
  };

  const send = async () => {
    if (!to.trim()) return toast.error("Recipient email required");
    if (!subject.trim()) return toast.error("Subject required");
    if (!body.trim()) return toast.error("Body required");
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSending(false); return; }

    // Find or create thread
    let threadId: string | null = null;
    const { data: existing } = await supabase
      .from("communication_threads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("job_candidate_id", jobCandidateId)
      .eq("subject", subject.trim())
      .maybeSingle();

    if (existing) threadId = (existing as any).id;
    if (!threadId) {
      const { data: t, error: tErr } = await supabase
        .from("communication_threads")
        .insert({
          workspace_id: workspaceId,
          subject: subject.trim(),
          channel: "email",
          candidate_id: candidateId,
          job_candidate_id: jobCandidateId,
          participant_email: to.trim(),
          participant_name: candidateName,
          created_by: u.user.id,
        })
        .select("id")
        .single();
      if (tErr || !t) { setSending(false); return toast.error(tErr?.message ?? "Failed to create thread"); }
      threadId = (t as any).id;
    }

    // Insert message (stub send – stored only)
    const { error: mErr } = await supabase.from("messages").insert({
      thread_id: threadId,
      workspace_id: workspaceId,
      direction: "outbound",
      body: body.trim(),
      recipient_email: to.trim(),
      sender_user_id: u.user.id,
    });
    if (mErr) { setSending(false); return toast.error(mErr.message); }

    // Activity log
    const { data: jc } = await supabase
      .from("job_candidates")
      .select("job_id, candidate_id")
      .eq("id", jobCandidateId)
      .maybeSingle();
    await supabase.from("activity_logs").insert({
      workspace_id: workspaceId,
      job_id: (jc as any)?.job_id ?? null,
      job_candidate_id: jobCandidateId,
      candidate_id: (jc as any)?.candidate_id ?? candidateId,
      actor_id: u.user.id,
      action_type: "email_sent",
      to_value: to.trim(),
      metadata: { subject: subject.trim(), thread_id: threadId, recipient: to.trim() },
    });

    setSending(false);
    toast.success("Email logged and added to Activity.");
    onOpenChange(false);
    setSubject(""); setBody(""); setTemplateId("blank");
    onSent?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Send email</DialogTitle>
          <DialogDescription>
            Compose an email to {candidateName}. Sent emails are logged into the candidate's Activity tab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Blank message</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Placeholders are filled when applying a template: <code>{"{{candidate_name}}"}</code>, <code>{"{{job_title}}"}</code>.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending}>
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
