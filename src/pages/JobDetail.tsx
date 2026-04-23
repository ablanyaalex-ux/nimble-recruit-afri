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
import { CandidateDrawer } from "@/components/pipeline/CandidateDrawer";
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
  candidate_id: string;
  candidates: { full_name: string; headline: string | null; source: string | null };
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
  selected,
  selectMode,
  onToggleSelect,
  onClick,
}: {
  entry: PipelineEntry;
  canDrag: boolean;
  selected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  const dragDisabled = !canDrag || selectMode;
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
      className={`p-3 ${dragDisabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary/40" : ""}`}
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
          <div className="font-medium text-sm leading-tight">{entry.candidates.full_name}</div>
          {entry.candidates.headline && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.candidates.headline}</div>
          )}
          {entry.candidates.source && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">
              {entry.candidates.source.replace(/_/g, " ")}
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
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [recruiter, setRecruiter] = useState<Recruiter | null>(null);
  const [hiringMgrs, setHiringMgrs] = useState<HiringMgr[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

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
        .select("id, stage, candidate_id, candidates(full_name, headline, source)")
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

  // Open candidate drawer from notification deep link
  useEffect(() => {
    const jc = searchParams.get("jc");
    if (jc) {
      setActiveDrawer(jc);
      searchParams.delete("jc");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const n = e.candidates.full_name?.toLowerCase() ?? "";
      const h = e.candidates.headline?.toLowerCase() ?? "";
      return n.includes(q) || h.includes(q);
    });
  }, [entries, search]);

  const grouped = useMemo(() => {
    const g: Record<string, PipelineEntry[]> = {};
    for (const s of stages) g[s.key] = [];
    for (const e of visibleEntries) {
      if (g[e.stage]) g[e.stage].push(e);
    }
    return g;
  }, [visibleEntries, stages]);

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

      {/* Search + meta */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates in this job…"
            className="pl-9"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {search ? `${visibleEntries.length} of ${totalCandidates}` : `${totalCandidates}`} candidate{totalCandidates === 1 ? "" : "s"}
        </div>
      </div>

      {isHM && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing candidates from interview stages onward.
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
          {stages.map((stage) => (
            <DroppableColumn key={stage.key} stageKey={stage.key}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                  {stage.label}
                </div>
                <span className="text-xs text-muted-foreground">{grouped[stage.key]?.length ?? 0}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {grouped[stage.key]?.map((entry) => (
                  <DraggableCard
                    key={entry.id}
                    entry={entry}
                    canDrag={canDrag}
                    onClick={() => setActiveDrawer(entry.id)}
                  />
                ))}
              </div>
            </DroppableColumn>
          ))}
        </div>
      </DndContext>

      <CandidateDrawer
        jobCandidateId={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        onChanged={refresh}
        stages={allStages}
      />

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
    </PageContainer>
  );
}
