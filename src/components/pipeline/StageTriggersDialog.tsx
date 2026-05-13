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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Trash2, Plus, Zap, Clock } from "lucide-react";
import { toast } from "sonner";

export type StageTrigger = {
  id: string;
  stage_id: string;
  workspace_id: string;
  trigger_type: "send_email" | "send_survey" | "slack_notification" | "create_task";
  settings: any;
  enabled: boolean;
  template_id: string | null;
  delay_minutes: number;
};

type Template = { id: string; name: string; type?: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  stageId: string;
  stageLabel: string;
  onChanged?: () => void;
};

const DEFAULT_SUBJECT = "Update on your application for {{job_title}}";
const DEFAULT_BODY = "Hi {{candidate_name}},\n\nYour application has moved to: {{stage}}.\n\nWe'll be in touch soon.";

const DELAY_OPTIONS = [
  { value: 0, label: "Immediate" },
  { value: 60, label: "1 hour later" },
  { value: 60 * 24, label: "24 hours later" },
];

export function StageTriggersDialog({ open, onOpenChange, workspaceId, stageId, stageLabel, onChanged }: Props) {
  const [triggers, setTriggers] = useState<StageTrigger[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<"send_email" | "send_survey">("send_email");
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [delay, setDelay] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [tr, tp] = await Promise.all([
      supabase.from("stage_triggers" as any)
        .select("id, stage_id, workspace_id, trigger_type, settings, enabled, template_id, delay_minutes")
        .eq("stage_id", stageId)
        .order("created_at", { ascending: true }),
      supabase.from("templates").select("id, name, type").eq("workspace_id", workspaceId).in("type", ["email", "survey"]),
    ]);
    setLoading(false);
    if (tr.error) { toast.error(tr.error.message); return; }
    setTriggers((tr.data ?? []) as unknown as StageTrigger[]);
    setTemplates((tp.data ?? []) as Template[]);
  };

  useEffect(() => {
    if (open && stageId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stageId]);

  const handleAdd = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (useTemplate && !templateId) return toast.error("Pick a template");
    setSaving(true);
    const { error } = await supabase.from("stage_triggers" as any).insert({
      workspace_id: workspaceId,
      stage_id: stageId,
      trigger_type: type,
      template_id: useTemplate ? templateId : null,
      delay_minutes: delay,
      settings: useTemplate ? {} : { subject: subject.trim() || DEFAULT_SUBJECT, body: body.trim() || DEFAULT_BODY },
      enabled: true,
      created_by: u.user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Trigger added");
    setAdding(false);
    setSubject(DEFAULT_SUBJECT);
    setBody(DEFAULT_BODY);
    setUseTemplate(false);
    setTemplateId("");
    setDelay(0);
    await refresh();
    onChanged?.();
  };

  const toggle = async (t: StageTrigger, enabled: boolean) => {
    const { error } = await supabase.from("stage_triggers" as any).update({ enabled }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTriggers((prev) => prev.map((x) => x.id === t.id ? { ...x, enabled } : x));
    onChanged?.();
  };

  const remove = async (t: StageTrigger) => {
    const { error } = await supabase.from("stage_triggers" as any).delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTriggers((prev) => prev.filter((x) => x.id !== t.id));
    onChanged?.();
    toast.success("Trigger removed");
  };

  const delayLabel = (m: number) => DELAY_OPTIONS.find((o) => o.value === m)?.label ?? `${m}m later`;
  const templateName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? "Template";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Triggers for "{stageLabel}"</DialogTitle>
          <DialogDescription>
            Run automations when a candidate is moved into this stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : triggers.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
              No triggers yet for this stage.
            </div>
          ) : (
            triggers.map((t) => (
              <div key={t.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                    <Mail className="h-4 w-4" />
                    {t.trigger_type === "send_email" ? "Send email to candidate" : t.trigger_type}
                    <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3" /> {delayLabel(t.delay_minutes ?? 0)}</Badge>
                    {!t.enabled && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={t.enabled} onCheckedChange={(v) => toggle(t, v)} />
                    <Button size="icon" variant="ghost" onClick={() => remove(t)} aria-label="Delete trigger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {t.trigger_type === "send_email" && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {t.template_id ? (
                      <div><span className="font-medium text-foreground">Template:</span> {templateName(t.template_id)}</div>
                    ) : (
                      <>
                        <div><span className="font-medium text-foreground">Subject:</span> {t.settings?.subject ?? DEFAULT_SUBJECT}</div>
                        <div className="whitespace-pre-wrap line-clamp-3"><span className="font-medium text-foreground">Body:</span> {t.settings?.body ?? DEFAULT_BODY}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {adding ? (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="send_email">Send email to candidate</SelectItem>
                  <SelectItem value="slack_notification" disabled>Slack notification (coming soon)</SelectItem>
                  <SelectItem value="create_task" disabled>Create task (coming soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Send delay</Label>
              <Select value={String(delay)} onValueChange={(v) => setDelay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={useTemplate} onCheckedChange={setUseTemplate} id="use-template" />
              <Label htmlFor="use-template" className="cursor-pointer">Use a saved template</Label>
            </div>

            {useTemplate ? (
              <div className="space-y-2">
                <Label>Template</Label>
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
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: <code>{"{{candidate_name}}"}</code>, <code>{"{{job_title}}"}</code>, <code>{"{{stage}}"}</code>
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Add trigger"}</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end border-t pt-4">
            <Button onClick={() => setAdding(true)} variant="outline">
              <Plus className="h-4 w-4" /> Add trigger
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
