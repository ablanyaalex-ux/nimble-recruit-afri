import { useEffect, useMemo, useState } from "react";
import { Plus, Users, FileText, Trash2, Tag as TagIcon, Archive, X, Search, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { canEditWorkspace } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { BulkRejectDialog } from "@/components/pipeline/BulkRejectDialog";
import { BulkAddTagDialog } from "@/components/pipeline/BulkAddTagDialog";
import { parseBoolean, evaluate, positiveTermsFor, extractSnippets } from "@/lib/booleanSearch";
import { HighlightedText } from "@/components/HighlightedText";

type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  headline: string | null;
  resume_path: string | null;
  resume_full_text: string | null;
  notes: string | null;
  archived: boolean;
};

type CandidateTag = { candidate_id: string; tag: string };

export default function Candidates() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tagsByCand, setTagsByCand] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<"active" | "archived">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReject, setBulkReject] = useState(false);
  const [bulkTag, setBulkTag] = useState(false);
  const [query, setQuery] = useState("");

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", headline: "", location: "", linkedin_url: "", notes: "",
  });
  const [resume, setResume] = useState<File | null>(null);

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    setSelected(new Set());
    const { data } = await supabase
      .from("candidates")
      .select("id, full_name, email, headline, resume_path, resume_full_text, notes, archived")
      .eq("workspace_id", currentWorkspaceId)
      .order("created_at", { ascending: false })
      .limit(2000);
    setCandidates((data ?? []) as Candidate[]);

    const ids = (data ?? []).map((c: any) => c.id);
    if (ids.length) {
      const { data: tagRows } = await supabase
        .from("candidate_tags")
        .select("candidate_id, tag")
        .in("candidate_id", ids);
      const map: Record<string, string[]> = {};
      for (const r of (tagRows ?? []) as CandidateTag[]) {
        (map[r.candidate_id] ??= []).push(r.tag);
      }
      setTagsByCand(map);
    } else {
      setTagsByCand({});
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentWorkspaceId]);

  const ast = useMemo(() => parseBoolean(query), [query]);
  const highlightTerms = useMemo(() => positiveTermsFor(query), [query]);

  const visible = useMemo(() => {
    const base = candidates.filter((c) => (view === "archived" ? c.archived : !c.archived));
    if (!ast) return base;
    return base.filter((c) => {
      const tags = (tagsByCand[c.id] ?? []).join(" ");
      const hay = [c.full_name, c.email, c.headline, c.notes, c.resume_full_text, tags]
        .filter(Boolean).join("\n");
      return evaluate(ast, hay);
    });
  }, [candidates, view, ast, tagsByCand]);

  // Drop selections that are no longer visible (e.g. after switching tab)
  useEffect(() => {
    if (selected.size === 0) return;
    const visIds = new Set(visible.map((c) => c.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) { if (visIds.has(id)) next.add(id); else changed = true; }
    if (changed) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, candidates]);

  const allSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visible.map((c) => c.id)));
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentWorkspaceId || !form.full_name.trim()) return toast.error("Name is required");
    setSubmitting(true);
    const { data: cand, error } = await supabase
      .from("candidates")
      .insert({
        workspace_id: currentWorkspaceId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        headline: form.headline.trim() || null,
        location: form.location.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !cand) { setSubmitting(false); return toast.error(error?.message ?? "Failed"); }

    if (resume) {
      const path = `${currentWorkspaceId}/${cand.id}/${resume.name}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, resume, { upsert: true });
      if (upErr) toast.error(`Resume upload failed: ${upErr.message}`);
      else await supabase.from("candidates").update({ resume_path: path }).eq("id", cand.id);
    }

    setSubmitting(false);
    toast.success("Candidate added.");
    setOpen(false);
    setForm({ full_name: "", email: "", phone: "", headline: "", location: "", linkedin_url: "", notes: "" });
    setResume(null);
    refresh();
  };

  const bulkArchive = async (archive: boolean) => {
    if (!user) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("candidates")
      .update({ archived: archive, archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? user.id : null })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${archive ? "Archived" : "Restored"} ${ids.length}`);
    refresh();
  };

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)).map((c) => ({ candidate_id: c.id, full_name: c.full_name, email: c.email })),
    [candidates, selected]
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="Candidates"
        description="Your shortlists and the people moving through pipelines."
        actions={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> New candidate</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New candidate</DialogTitle></DialogHeader>
                <form onSubmit={onCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Full name</Label>
                    <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Phone</Label>
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Headline</Label>
                      <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Location</Label>
                      <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>LinkedIn URL</Label>
                    <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Resume (PDF/DOC)</Label>
                    <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} /></div>
                  <div className="space-y-2"><Label>Notes</Label>
                    <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Add"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-2xl">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Boolean search: ("React" OR "Vue") AND "TypeScript" NOT "Junior"`}
            className="pl-9 pr-9 h-10"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Search tips">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">
                <p className="font-medium mb-1">Boolean search</p>
                <p><code>AND</code>, <code>OR</code>, <code>NOT</code> supported.</p>
                <p>Quote for phrases: <code>"Product Manager"</code></p>
                <p>Group with parens: <code>("React" OR "Vue") AND "TS"</code></p>
                <p className="mt-1 text-muted-foreground">Searches name, headline, email, tags, notes and full CV text.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {query.trim() && !loading && (
        <p className="text-xs text-muted-foreground mb-2">
          {visible.length} match{visible.length === 1 ? "" : "es"} for <code className="px-1 rounded bg-muted">{query.trim()}</code>
        </p>
      )}


      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-display text-xl">No candidates {view === "archived" ? "archived" : "yet"}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_2rem] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              aria-label="Select all"
            />
            <span>Name</span>
            <span className="hidden sm:block">Headline / Email</span>
            <span className="hidden md:block">Tags</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {visible.map((c) => {
              const isSel = selected.has(c.id);
              const tags = tagsByCand[c.id] ?? [];
              const snippets = highlightTerms.length && c.resume_full_text
                ? extractSnippets(c.resume_full_text, highlightTerms, 2, 70)
                : [];
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_2rem] items-start gap-3 px-4 py-3 transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/30"}`}
                >
                  <Checkbox className="mt-1" checked={isSel} onCheckedChange={() => toggle(c.id)} aria-label={`Select ${c.full_name}`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      <HighlightedText text={c.full_name} terms={highlightTerms} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate sm:hidden">
                      <HighlightedText text={c.headline ?? c.email ?? "—"} terms={highlightTerms} />
                    </div>
                    {snippets.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
                        {snippets.map((s, i) => (
                          <div key={i} className="line-clamp-2">
                            <span className="text-primary/70">CV:</span>{" "}
                            <HighlightedText text={s} terms={highlightTerms} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block min-w-0 text-sm text-muted-foreground truncate">
                    <HighlightedText text={c.headline ?? c.email ?? "—"} terms={highlightTerms} />
                  </div>
                  <div className="hidden md:flex flex-wrap gap-1 min-w-0">
                    {tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                        <HighlightedText text={t} terms={highlightTerms} />
                      </Badge>
                    ))}
                    {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
                  </div>
                  <div className="text-right pt-1">
                    {c.resume_path && <FileText className="h-4 w-4 text-muted-foreground inline" />}
                  </div>
                </div>
              );
            })}
          </div>

        </Card>
      )}

      {/* Floating bulk action bar */}
      {selected.size > 0 && canEdit && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium pr-2 border-r">{selected.size} selected</span>
            {view === "active" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => bulkArchive(true)}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkTag(true)}>
                  <TagIcon className="h-4 w-4" /> Add tag
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkReject(true)}>
                  <Trash2 className="h-4 w-4" /> Reject
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => bulkArchive(false)}>
                <Archive className="h-4 w-4" /> Restore
              </Button>
            )}
          </div>
        </div>
      )}

      {currentWorkspaceId && (
        <>
          <BulkRejectDialog
            open={bulkReject}
            onOpenChange={setBulkReject}
            workspaceId={currentWorkspaceId}
            candidates={selectedCandidates}
            onDone={refresh}
          />
          <BulkAddTagDialog
            open={bulkTag}
            onOpenChange={setBulkTag}
            workspaceId={currentWorkspaceId}
            candidateIds={Array.from(selected)}
            onDone={refresh}
          />
        </>
      )}
    </PageContainer>
  );
}
