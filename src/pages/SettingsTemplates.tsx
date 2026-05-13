import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { canEditWorkspace } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, FileText, Mail, FileSignature, ClipboardList } from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  workspace_id: string;
  type: "email" | "job_description" | "offer_letter" | "survey";
  name: string;
  content: string;
};

const MOCK = {
  candidate_name: "John Doe",
  job_title: "Software Engineer",
  company_name: "Acme Corp",
  stage: "Interview",
};

const TYPE_META: Record<Template["type"], { label: string; icon: any }> = {
  email: { label: "Email", icon: Mail },
  job_description: { label: "Job description", icon: FileText },
  offer_letter: { label: "Offer letter", icon: FileSignature },
  survey: { label: "Survey", icon: ClipboardList },
};

function renderPreview(text: string) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (MOCK as any)[k] ?? `{{${k}}}`);
}

export default function SettingsTemplates() {
  const { currentWorkspaceId, currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState<"all" | Template["type"]>("all");
  const [selected, setSelected] = useState<Template | null>(null);
  const [preview, setPreview] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<Template["type"]>("email");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    const { data, error } = await supabase
      .from("templates")
      .select("id, workspace_id, type, name, content")
      .eq("workspace_id", currentWorkspaceId)
      .order("updated_at", { ascending: false });
    if (error) return toast.error(error.message);
    setTemplates((data ?? []) as Template[]);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentWorkspaceId]);

  const filtered = useMemo(
    () => templates.filter((t) => filter === "all" || t.type === filter),
    [templates, filter]
  );

  const startNew = () => {
    setSelected(null);
    setName("");
    setType("email");
    setContent("Hi {{candidate_name}},\n\n…\n\nThanks,\n{{company_name}}");
    setPreview(false);
  };

  const open = (t: Template) => {
    setSelected(t);
    setName(t.name);
    setType(t.type);
    setContent(t.content);
    setPreview(false);
  };

  const save = async () => {
    if (!currentWorkspaceId) return;
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    if (selected) {
      const { error } = await supabase.from("templates").update({
        name: name.trim(), type, content,
      }).eq("id", selected.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Template updated");
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setBusy(false); return; }
      const { data, error } = await supabase.from("templates").insert({
        workspace_id: currentWorkspaceId, type, name: name.trim(), content, created_by: u.user.id,
      }).select().single();
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Template created");
      setSelected(data as Template);
    }
    refresh();
  };

  const remove = async () => {
    if (!selected) return;
    const { error } = await supabase.from("templates").delete().eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    setSelected(null);
    setName(""); setContent("");
    refresh();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Templates"
        description="Reusable email, job description, and offer letter templates with live placeholder preview."
        actions={canEdit ? <Button onClick={startNew}><Plus className="h-4 w-4" /> New template</Button> : undefined}
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="job_description">Job description</TabsTrigger>
          <TabsTrigger value="offer_letter">Offer letter</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card className="p-2 max-h-[600px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center">No templates yet.</div>
          ) : filtered.map((t) => {
            const Icon = TYPE_META[t.type].icon;
            const active = selected?.id === t.id;
            return (
              <button key={t.id} onClick={() => open(t)}
                className={`w-full text-left p-2 rounded-md flex items-start gap-2 hover:bg-accent ${active ? "bg-accent" : ""}`}
              >
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {TYPE_META[t.type].label}
                  </div>
                </div>
              </button>
            );
          })}
        </Card>

        <Card className="p-4 space-y-4">
          {!canEdit && (
            <Badge variant="outline">Read-only</Badge>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interview invitation" disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as Template["type"])} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="job_description">Job description</SelectItem>
                  <SelectItem value="offer_letter">Offer letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Content</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="preview-toggle" className="text-xs text-muted-foreground">Preview</Label>
              <Switch id="preview-toggle" checked={preview} onCheckedChange={setPreview} />
            </div>
          </div>

          {preview ? (
            <div className="rounded-md border border-border bg-secondary/40 p-4 min-h-[200px] whitespace-pre-wrap text-sm">
              {renderPreview(content) || <span className="text-muted-foreground">Empty</span>}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              disabled={!canEdit}
              placeholder="Use placeholders like {{candidate_name}}, {{job_title}}, {{company_name}}, {{stage}}"
            />
          )}

          <p className="text-xs text-muted-foreground">
            Placeholders: <code>{"{{candidate_name}}"}</code>, <code>{"{{job_title}}"}</code>, <code>{"{{company_name}}"}</code>, <code>{"{{stage}}"}</code>
          </p>

          {canEdit && (
            <div className="flex justify-between border-t pt-4">
              <div>
                {selected && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : selected ? "Save changes" : "Create template"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
