import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, FileImage, FileType, Link2, Upload, ExternalLink, Trash2, Download, Plus } from "lucide-react";
import { toast } from "sonner";

type Doc = {
  id: string;
  kind: "file" | "link";
  category: "cv" | "task" | "reference" | "assessment" | "other";
  name: string;
  file_path: string | null;
  url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

const CATEGORY_LABEL: Record<Doc["category"], string> = {
  cv: "CV / Resume",
  task: "Take-home task",
  reference: "Reference",
  assessment: "Assessment",
  other: "Other",
};

const CATEGORY_TONE: Record<Doc["category"], string> = {
  cv: "border-primary/30 text-primary",
  task: "border-amber-500/30 text-amber-700 dark:text-amber-400",
  reference: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  assessment: "border-sky-500/30 text-sky-700 dark:text-sky-400",
  other: "",
};

function fileIcon(mime: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("pdf")) return FileType;
  return FileText;
}

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CandidateDocuments({
  jobCandidateId,
  candidateId,
  workspaceId,
  canEdit,
  onDocCountChange,
}: {
  jobCandidateId: string;
  candidateId: string;
  workspaceId: string;
  canEdit: boolean;
  onDocCountChange?: (count: number) => void;
}) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ name: "", url: "", category: "assessment" as Doc["category"] });
  const [pendingCategory, setPendingCategory] = useState<Doc["category"]>("cv");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("candidate_documents" as any)
      .select("*")
      .eq("job_candidate_id", jobCandidateId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as unknown as Doc[];
    setDocs(list);
    setLoading(false);
    onDocCountChange?.(list.length);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCandidateId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const path = `${workspaceId}/${jobCandidateId}/${crypto.randomUUID()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("candidate-documents").upload(path, f);
      if (upErr) {
        toast.error(`${f.name}: ${upErr.message}`);
        continue;
      }
      const { error: insErr } = await supabase.from("candidate_documents" as any).insert({
        workspace_id: workspaceId,
        job_candidate_id: jobCandidateId,
        candidate_id: candidateId,
        kind: "file",
        category: pendingCategory,
        name: f.name,
        file_path: path,
        mime_type: f.type || null,
        size_bytes: f.size,
        uploaded_by: user.id,
      });
      if (insErr) toast.error(insErr.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Documents uploaded.");
    refresh();
  };

  const addLink = async () => {
    if (!user) return;
    const name = linkForm.name.trim();
    const url = linkForm.url.trim();
    if (!name || !url) return toast.error("Name and URL required.");
    const { error } = await supabase.from("candidate_documents" as any).insert({
      workspace_id: workspaceId,
      job_candidate_id: jobCandidateId,
      candidate_id: candidateId,
      kind: "link",
      category: linkForm.category,
      name,
      url,
      uploaded_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Assessment link added.");
    setLinkOpen(false);
    setLinkForm({ name: "", url: "", category: "assessment" });
    refresh();
  };

  const openFile = async (d: Doc) => {
    if (!d.file_path) return;
    const { data } = await supabase.storage.from("candidate-documents").createSignedUrl(d.file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Remove "${d.name}"?`)) return;
    if (d.file_path) await supabase.storage.from("candidate-documents").remove([d.file_path]);
    const { error } = await supabase.from("candidate_documents" as any).delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    refresh();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="font-display text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Documents & Assessments ({docs.length})
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={pendingCategory} onValueChange={(v) => setPendingCategory(v as Doc["category"])}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).filter(([k]) => k !== "assessment").map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload file"}
            </Button>
            <Button size="sm" onClick={() => setLinkOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add assessment
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet. Upload a CV, take-home task, or paste an assessment link.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => {
            const Icon = d.kind === "link" ? Link2 : fileIcon(d.mime_type);
            return (
              <div key={d.id} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3 group">
                <div className="h-10 w-10 shrink-0 rounded-md bg-background border grid place-items-center">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${CATEGORY_TONE[d.category]}`}>
                      {CATEGORY_LABEL[d.category]}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {d.kind === "file" ? fmtSize(d.size_bytes) : "External link"} · {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  {d.kind === "link" ? (
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                      <a href={d.url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openFile(d)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(d)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add assessment link</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={linkForm.name} onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })} placeholder="e.g. GitHub take-home repo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={linkForm.category} onValueChange={(v) => setLinkForm({ ...linkForm, category: v as Doc["category"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={addLink}>Add link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
