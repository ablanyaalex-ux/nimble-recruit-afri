import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Trash2,
  Megaphone,
  Settings2,
  Search,
  MapPin,
  Building2,
  Users,
  UserCircle2,
  Clock,
  Pencil,
  Settings,
  ChevronRight,
  X,
  Undo2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import {
  canEditWorkspace,
  canMoveStages,
  visibleStagesForRole,
  isHiringManager,
} from "@/lib/permissions";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { PostJobDialog } from "@/components/pipeline/PostJobDialog";
import { AddCandidateDialog } from "@/components/pipeline/AddCandidateDialog";
import { PipelineStagesDialog } from "@/components/pipeline/PipelineStagesDialog";
import { EditJobDialog } from "@/components/pipeline/EditJobDialog";
import { Input } from "@/components/ui/input";
import { jobStatusBadgeClass } from "@/lib/jobStatus";
import { toast } from "sonner";

type Job = {
  id: string;
  title: string;
  status: "open" | "on_hold" | "closed" | "filled";
  client_id: string;
  workspace_id: string;
  location: string | null;
  description: string | null;
  reference: string | null;
  employment_type: string | null;
  created_at: string;
  created_by: string;
  clients: { name: string } | null;
};

type PipelineEntry = {
  id: string;
  stage: string;
  rejected: boolean;
  rejection_reason: string | null;
  candidate_id: string;
  candidates: { full_name: string; headline: string | null; source: string | null; location: string | null };
};

type Recruiter = { id: string; display_name: string | null };
type HiringMgr = { id: string; name: string; title: string | null };

const STATUS_LABELS: Record<Job["status"], string> = {
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

function DraggableCard({
  entry,
  canDrag,
  canEdit,
  selected,
  selectMode,
  onToggleSelect,
  onClick,
  onProgress,
  onReject,
  onReinstate,
}: {
  entry: PipelineEntry;
  canDrag: boolean;
  canEdit: boolean;
  selected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onProgress: (e: React.MouseEvent) => void;
  onReject: (e: React.MouseEvent) => void;
  onReinstate: (e: React.MouseEvent) => void;
}) {
  const dragDisabled = !canDrag || selectMode || entry.rejected;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: dragDisabled,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...(dragDisabled ? {} : listeners)}
      {...attributes}
      onClick={(e) => {
        if (selectMode) {
          e.stopPropagation();
          onToggleSelect();
        } else {
          onClick();
        }
      }}
      className={`p-3 ${dragDisabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary/40" : ""} ${entry.rejected ? "opacity-80" : ""}`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
          aria-label={`Select ${entry.candidates.full_name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="font-medium text-sm leading-tight">{entry.candidates.full_name}</div>
            {entry.rejected && <Badge variant="destructive" className="h-4 text-[9px] px-1.5">Rejected</Badge>}
          </div>
          {entry.candidates.headline && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.candidates.headline}</div>
          )}
          {entry.candidates.source && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">
              {entry.candidates.source.replace(/_/g, " ")}
            </div>
          )}
          {canEdit && !selectMode && (
            <div className="flex items-center gap-1 mt-2 -mb-1">
              {!entry.rejected ? (
                <>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onProgress}>
                    <ChevronRight className="h-3 w-3" /> Progress
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive" onClick={onReject}>
                    <X className="h-3 w-3" /> Reject
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onReinstate}>
                  <Undo2 className="h-3 w-3" /> Reinstate
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DroppableColumn({ stageKey, children }: { stageKey: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[260px] rounded-lg border border-border bg-secondary/40 p-3 transition-colors ${
        isOver ? "bg-accent" : ""
      }`}
    >
      {children}
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const canDrag = canMoveStages(currentRole);
  const isHM = isHiringManager(currentRole);

  const [job, setJob] = useState<Job | null>(null);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // candidate cards now navigate to a dedicated page
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [recruiter, setRecruiter] = useState<Recruiter | null>(null);
  const [hiringMgrs, setHiringMgrs] = useState<HiringMgr[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [view, setView] = useState<"active" | "rejected">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [rejectedStageFilter, setRejectedStageFilter] = useState<string>("all");
  const [rejectedLocationFilter, setRejectedLocationFilter] = useState<string>("all");
  // Reject dialog state (used for both single and bulk reject)
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; ids: string[]; reason: string; busy: boolean }>({
    open: false,
    ids: [],
    reason: "",
    busy: false,
  });

  const { stages: allStages, refresh: refreshStages } = usePipelineStages(job?.workspace_id);
  const stages = useMemo(() => visibleStagesForRole(currentRole, allStages), [currentRole, allStages]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    const [jobRes, entRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, status, client_id, workspace_id, location, description, reference, employment_type, created_at, created_by, clients(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("job_candidates")
        .select("id, stage, rejected, rejection_reason, candidate_id, candidates(full_name, headline, source, location)")
        .eq("job_id", id)
        .order("position"),
    ]);
    if (jobRes.data) {
      const j = jobRes.data as unknown as Job;
      setJob(j);
      // Recruiter in charge (job creator) and assigned hiring managers
      const [profRes, hmRes] = await Promise.all([
        supabase.from("profiles").select("id, display_name").eq("id", j.created_by).maybeSingle(),
        supabase
          .from("job_hiring_managers")
          .select("contact_id, client_contacts(id, name, title)")
          .eq("job_id", j.id),
      ]);
      setRecruiter((profRes.data as Recruiter) ?? null);
      const mgrs = ((hmRes.data ?? []) as Array<{ client_contacts: HiringMgr | null }>)
        .map((r) => r.client_contacts)
        .filter((c): c is HiringMgr => !!c);
      setHiringMgrs(mgrs);
    }
    if (entRes.data) setEntries(entRes.data as unknown as PipelineEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Open candidate page from notification deep link (legacy ?jc= support)
  useEffect(() => {
    const jc = searchParams.get("jc");
    if (jc && id) {
      navigate(`/jobs/${id}/candidates/${jc}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.candidates.source) set.add(e.candidates.source);
    return Array.from(set).sort();
  }, [entries]);

  const rejectedLocations = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.rejected && e.candidates.location) set.add(e.candidates.location);
    return Array.from(set).sort();
  }, [entries]);

  const rejectedStages = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.rejected) set.add(e.stage);
    return stages.filter((s) => set.has(s.key));
  }, [entries, stages]);

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (view === "active" && e.rejected) return false;
      if (view === "rejected" && !e.rejected) return false;
      if (sourceFilter !== "all" && (e.candidates.source ?? "") !== sourceFilter) return false;
      if (view === "rejected") {
        if (rejectedStageFilter !== "all" && e.stage !== rejectedStageFilter) return false;
        if (rejectedLocationFilter !== "all" && (e.candidates.location ?? "") !== rejectedLocationFilter) return false;
      }
      if (!q) return true;
      const n = e.candidates.full_name?.toLowerCase() ?? "";
      const h = e.candidates.headline?.toLowerCase() ?? "";
      const r = e.rejection_reason?.toLowerCase() ?? "";
      return n.includes(q) || h.includes(q) || r.includes(q);
    });
  }, [entries, search, sourceFilter, view, rejectedStageFilter, rejectedLocationFilter]);

  const rejectedCount = useMemo(() => entries.filter((e) => e.rejected).length, [entries]);

  const grouped = useMemo(() => {
    const g: Record<string, PipelineEntry[]> = {};
    for (const s of stages) g[s.key] = [];
    for (const e of visibleEntries) {
      if (g[e.stage]) g[e.stage].push(e);
    }
    return g;
  }, [visibleEntries, stages]);

  const selectMode = selected.size > 0;

  const toggleSelect = (entryId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const toggleSelectStage = (stageKey: string) => {
    const ids = grouped[stageKey]?.map((e) => e.id) ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkMoveTo = async (stageKey: string) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("job_candidates").update({ stage: stageKey }).in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    setEntries((prev) => prev.map((x) => (selected.has(x.id) ? { ...x, stage: stageKey } : x)));
    toast.success(`Moved ${ids.length} candidate${ids.length === 1 ? "" : "s"}.`);
    clearSelection();
  };

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("job_candidates").delete().in("id", ids);
    setBulkBusy(false);
    setConfirmBulkRemove(false);
    if (error) return toast.error(error.message);
    setEntries((prev) => prev.filter((x) => !selected.has(x.id)));
    toast.success(`Removed ${ids.length} candidate${ids.length === 1 ? "" : "s"} from this job.`);
    clearSelection();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const newStage = String(e.over.id);
    const entry = entries.find((x) => x.id === e.active.id);
    if (!entry || entry.stage === newStage) return;
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, stage: newStage } : x)));
    const { error } = await supabase.from("job_candidates").update({ stage: newStage as any }).eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      refresh();
    }
  };

  const progressEntry = async (entry: PipelineEntry) => {
    const idx = stages.findIndex((s) => s.key === entry.stage);
    const next = stages[idx + 1];
    if (!next) return toast.info("Already at the final stage.");
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, stage: next.key, rejected: false } : x)));
    const { error } = await supabase
      .from("job_candidates")
      .update({ stage: next.key as any, rejected: false, rejected_at: null, rejected_by: null })
      .eq("id", entry.id);
    if (error) { toast.error(error.message); refresh(); return; }
    toast.success(`Moved to ${next.label}.`);
  };

  const openRejectDialog = (ids: string[]) => {
    if (ids.length === 0) return;
    setRejectDialog({ open: true, ids, reason: "", busy: false });
  };

  const confirmReject = async () => {
    const reason = rejectDialog.reason.trim();
    if (!reason) { toast.error("Please provide a rejection reason."); return; }
    setRejectDialog((d) => ({ ...d, busy: true }));
    const ids = rejectDialog.ids;
    const { error } = await supabase
      .from("job_candidates")
      .update({
        rejected: true,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .in("id", ids);
    if (error) {
      setRejectDialog((d) => ({ ...d, busy: false }));
      return toast.error(error.message);
    }
    setEntries((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, rejected: true, rejection_reason: reason } : x)));
    toast.success(ids.length === 1 ? "Candidate rejected." : `Rejected ${ids.length} candidates.`);
    setRejectDialog({ open: false, ids: [], reason: "", busy: false });
    if (ids.length > 1) clearSelection();
  };

  const reinstateEntry = async (entry: PipelineEntry) => {
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, rejected: false, rejection_reason: null } : x)));
    const { error } = await supabase
      .from("job_candidates")
      .update({ rejected: false, rejected_at: null, rejected_by: null, rejection_reason: null })
      .eq("id", entry.id);
    if (error) { toast.error(error.message); refresh(); return; }
    toast.success("Candidate un-rejected.");
  };

  const updateStatus = async (status: Job["status"]) => {
    if (!job) return;
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (error) return toast.error(error.message);
    toast.success(`Job ${STATUS_LABELS[status].toLowerCase()}.`);
    setJob({ ...job, status });
  };

  const deleteJob = async () => {
    if (!job) return;
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) return toast.error(error.message);
    toast.success("Job deleted.");
    navigate("/jobs");
  };

  if (loading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!job) return <PageContainer><p>Job not found.</p></PageContainer>;

  const days = daysSince(job.created_at);
  const totalCandidates = entries.length;

  return (
    <PageContainer>
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Jobs
      </Link>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
            <span>{job.clients?.name ?? "Pipeline"}</span>
            {job.reference && (
              <span className="font-mono normal-case tracking-normal bg-secondary text-foreground/80 px-1.5 py-0.5 rounded">
                {job.reference}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight leading-tight">{job.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={jobStatusBadgeClass(job.status)}>{STATUS_LABELS[job.status]}</Badge>
          {canEdit && (
            <PostJobDialog
              job={job}
              trigger={<Button size="sm" variant="outline"><Megaphone className="h-4 w-4" /> Post job</Button>}
            />
          )}
          {canEdit && (
            <AddCandidateDialog jobId={job.id} workspaceId={job.workspace_id} onAdded={refresh} />
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Settings className="h-4 w-4" /> Settings
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit job details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStagesOpen(true)}>
                  <Settings2 className="h-4 w-4" /> Customise stages
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => updateStatus("open")} disabled={job.status === "open"}>
                  Mark as open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateStatus("on_hold")} disabled={job.status === "on_hold"}>
                  Pause
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateStatus("closed")} disabled={job.status === "closed"}>
                  Close
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateStatus("filled")} disabled={job.status === "filled"}>
                  Mark filled
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete job
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* At-a-glance summary */}
      <Card className="p-4 mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryItem
            icon={<Building2 className="h-4 w-4" />}
            label="Client"
            value={
              <Link to={`/clients/${job.client_id}`} className="hover:text-foreground hover:underline">
                {job.clients?.name ?? "—"}
              </Link>
            }
          />
          <SummaryItem
            icon={<UserCircle2 className="h-4 w-4" />}
            label="Recruiter"
            value={recruiter?.display_name ?? "—"}
          />
          <SummaryItem
            icon={<Users className="h-4 w-4" />}
            label="Hiring managers"
            value={
              hiringMgrs.length === 0 ? (
                <span className="text-muted-foreground">None assigned</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {hiringMgrs.map((m) => (
                    <Badge key={m.id} variant="secondary" className="font-normal">
                      {m.name}
                    </Badge>
                  ))}
                </div>
              )
            }
          />
          <SummaryItem
            icon={<Clock className="h-4 w-4" />}
            label="Days open"
            value={`${days} ${days === 1 ? "day" : "days"}`}
          />
          <SummaryItem
            icon={<MapPin className="h-4 w-4" />}
            label="Location"
            value={job.location ?? <span className="text-muted-foreground">—</span>}
          />
        </div>
      </Card>

      {/* View toggle: Active vs Rejected */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary/40">
          <button
            type="button"
            onClick={() => setView("active")}
            className={`px-3 h-8 text-xs rounded-[5px] transition-colors ${view === "active" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Active ({entries.length - rejectedCount})
          </button>
          <button
            type="button"
            onClick={() => setView("rejected")}
            className={`px-3 h-8 text-xs rounded-[5px] transition-colors ${view === "rejected" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>
      </div>

      {/* Search + filter + meta */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates…"
            className="pl-9 h-9"
          />
        </div>
        {sources.length > 0 && (
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {view === "rejected" && rejectedStages.length > 0 && (
          <Select value={rejectedStageFilter} onValueChange={setRejectedStageFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[180px]">
              <SelectValue placeholder="Stage before rejection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {rejectedStages.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {view === "rejected" && rejectedLocations.length > 0 && (
          <Select value={rejectedLocationFilter} onValueChange={setRejectedLocationFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {rejectedLocations.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="text-xs text-muted-foreground ml-auto">
          {visibleEntries.length} {view === "rejected" ? "rejected" : "active"} candidate{visibleEntries.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && canEdit && (
        <div className="flex items-center gap-2 flex-wrap mb-4 p-2.5 rounded-md border border-primary/30 bg-primary/5">
          <span className="text-sm font-medium px-1">
            {selected.size} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy}>
                Move to stage…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {stages.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => bulkMoveTo(s.key)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={bulkBusy}
            onClick={() => openRejectDialog(Array.from(selected))}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={bulkBusy}
            onClick={() => setConfirmBulkRemove(true)}
          >
            <Trash2 className="h-4 w-4" /> Remove from job
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {isHM && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing candidates from interview stages onward.
        </p>
      )}

      {view === "active" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
            {stages.map((stage) => {
              const stageEntries = grouped[stage.key] ?? [];
              const allSelected = stageEntries.length > 0 && stageEntries.every((e) => selected.has(e.id));
              const someSelected = !allSelected && stageEntries.some((e) => selected.has(e.id));
              return (
                <DroppableColumn key={stage.key} stageKey={stage.key}>
                  <div className="flex items-center justify-between mb-3 px-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {canEdit && stageEntries.length > 0 && (
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleSelectStage(stage.key)}
                          aria-label={`Select all in ${stage.label}`}
                        />
                      )}
                      <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground truncate">
                        {stage.label}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{stageEntries.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {stageEntries.map((entry) => (
                      <DraggableCard
                        key={entry.id}
                        entry={entry}
                        canDrag={canDrag}
                        canEdit={canEdit}
                        selected={selected.has(entry.id)}
                        selectMode={selectMode}
                        onToggleSelect={() => toggleSelect(entry.id)}
                        onClick={() => navigate(`/jobs/${job.id}/candidates/${entry.id}`)}
                        onProgress={(e) => { e.stopPropagation(); progressEntry(entry); }}
                        onReject={(e) => { e.stopPropagation(); openRejectDialog([entry.id]); }}
                        onReinstate={(e) => { e.stopPropagation(); reinstateEntry(entry); }}
                      />
                    ))}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>
        </DndContext>
      ) : (
        <Card className="divide-y divide-border">
          {visibleEntries.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No rejected candidates.</div>
          ) : visibleEntries.map((entry) => {
            const stageLabel = stages.find((s) => s.key === entry.stage)?.label ?? entry.stage;
            return (
              <div
                key={entry.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-accent/40 cursor-pointer"
                onClick={() => navigate(`/jobs/${job.id}/candidates/${entry.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm truncate">{entry.candidates.full_name}</div>
                    <Badge variant="outline" className="text-[10px]">{stageLabel}</Badge>
                    {entry.candidates.location && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        <MapPin className="h-3 w-3" /> {entry.candidates.location}
                      </Badge>
                    )}
                    {entry.candidates.source && (
                      <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                        {entry.candidates.source.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                  {entry.candidates.headline && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{entry.candidates.headline}</div>
                  )}
                  {entry.rejection_reason && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      <span className="font-medium text-foreground/80">Reason:</span> {entry.rejection_reason}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); reinstateEntry(entry); }}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Un-reject
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {canEdit && (
        <PipelineStagesDialog
          open={stagesOpen}
          onOpenChange={setStagesOpen}
          workspaceId={job.workspace_id}
          stages={allStages}
          onChanged={refreshStages}
        />
      )}

      {canEdit && (
        <EditJobDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          job={job}
          onSaved={refresh}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the job and its pipeline, comments, and feedback. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteJob} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkRemove} onOpenChange={setConfirmBulkRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selected.size} candidate{selected.size === 1 ? "" : "s"} from this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the pipeline along with their comments and feedback for this job. The candidate profiles themselves are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bulkRemove(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkBusy}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rejectDialog.open}
        onOpenChange={(o) => setRejectDialog((d) => ({ ...d, open: o, reason: o ? d.reason : "" }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectDialog.ids.length > 1 ? `${rejectDialog.ids.length} candidates` : "candidate"}
            </DialogTitle>
            <DialogDescription>
              Add a reason so the team has context and you can filter rejected candidates by it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="job-reject-reason" className="text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="job-reject-reason"
              rows={4}
              placeholder="e.g. Not enough relevant experience, salary expectations too high, withdrew, etc."
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, ids: [], reason: "", busy: false })}
              disabled={rejectDialog.busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectDialog.busy || !rejectDialog.reason.trim()}
            >
              <X className="h-3.5 w-3.5" />
              {rejectDialog.ids.length > 1 ? `Reject ${rejectDialog.ids.length}` : "Reject candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
