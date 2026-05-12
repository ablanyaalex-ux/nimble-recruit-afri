import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

type Question = {
  id: string;
  job_id: string;
  position: number;
  question_text: string;
  options: string[] | null;
  is_knockout: boolean;
  fail_value: string | null;
  rejection_template_id: string | null;
};

type Template = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  workspaceId: string;
};

export function JobQuestionsDialog({ open, onOpenChange, jobId, workspaceId }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [text, setText] = useState("");
  const [optionsInput, setOptionsInput] = useState("");
  const [isKnockout, setIsKnockout] = useState(false);
  const [failValue, setFailValue] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [q, t] = await Promise.all([
      supabase.from("job_application_questions").select("*").eq("job_id", jobId).order("position"),
      supabase.from("templates").select("id, name").eq("workspace_id", workspaceId).eq("type", "email"),
    ]);
    setQuestions((q.data ?? []) as Question[]);
    setTemplates((t.data ?? []) as Template[]);
  };

  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open, jobId]);

  const add = async () => {
    if (!text.trim()) return toast.error("Question text required");
    setBusy(true);
    const opts = optionsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("job_application_questions").insert({
      job_id: jobId,
      position: questions.length,
      question_text: text.trim(),
      options: opts.length ? opts : null,
      is_knockout: isKnockout,
      fail_value: isKnockout && failValue ? failValue : null,
      rejection_template_id: isKnockout && templateId ? templateId : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Question added");
    setText(""); setOptionsInput(""); setIsKnockout(false); setFailValue(""); setTemplateId("");
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("job_application_questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Application questions</DialogTitle>
          <DialogDescription>
            Add questions shown on the public application form. Mark a question as a knockout to auto-reject candidates who give the failing answer (with a 24-hour delayed email).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {questions.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
              No questions yet.
            </div>
          ) : questions.map((q) => (
            <div key={q.id} className="border rounded-md p-3 flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-1" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  {q.question_text}
                  {q.is_knockout && <Badge variant="destructive" className="text-[10px]">Knockout</Badge>}
                </div>
                {q.options && q.options.length > 0 && (
                  <div className="text-xs text-muted-foreground">Options: {q.options.join(", ")}</div>
                )}
                {q.is_knockout && q.fail_value && (
                  <div className="text-xs text-muted-foreground">Fails on: <code>{q.fail_value}</code></div>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(q.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="text-sm font-medium">Add a question</div>
          <div className="space-y-2">
            <Label>Question text</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. Are you legally authorized to work in this country?" />
          </div>
          <div className="space-y-2">
            <Label>Options (comma-separated, leave blank for free text)</Label>
            <Input value={optionsInput} onChange={(e) => setOptionsInput(e.target.value)} placeholder="Yes, No" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isKnockout} onCheckedChange={setIsKnockout} id="knockout" />
            <Label htmlFor="knockout" className="cursor-pointer">Knockout question</Label>
          </div>
          {isKnockout && (
            <>
              <div className="space-y-2">
                <Label>Fail value (auto-reject if answer matches)</Label>
                <Input value={failValue} onChange={(e) => setFailValue(e.target.value)} placeholder="No" />
              </div>
              <div className="space-y-2">
                <Label>Rejection email template (sent 24h after rejection)</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Choose template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No email templates yet — create one in Settings → Templates</div>
                    ) : templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Add question</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
