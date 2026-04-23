import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MoreVertical, Trash2, Megaphone, Settings2 } from "lucide-react";
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
  type PipelineStage,
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
  clients: { name: string } | null;
};

type PipelineEntry = {
  id: string;
  stage: string;
  candidate_id: string;
  candidates: { full_name: string; headline: string | null };
};

const STATUS_LABELS: Record<Job["status"], string> = {
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

function DraggableCard({
  entry,
  canDrag,
  onClick,
}: {
  entry: PipelineEntry;
  canDrag: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !canDrag,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`p-3 ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} hover:border-primary/40 transition-colors`}
    >
      <div className="font-medium text-sm leading-tight">{entry.candidates.full_name}</div>
      {entry.candidates.headline && (
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.candidates.headline}</div>
      )}
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

  const { stages: allStages, refresh: refreshStages } = usePipelineStages(job?.workspace_id);
  const stages = useMemo(() => visibleStagesForRole(currentRole, allStages), [currentRole, allStages]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    const [jobRes, entRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, status, client_id, workspace_id, location, description, clients(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("job_candidates")
        .select("id, stage, candidate_id, candidates(full_name, headline)")
        .eq("job_id", id)
        .order("position"),
    ]);
    if (jobRes.data) setJob(jobRes.data as unknown as Job);
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

  const grouped = useMemo(() => {
    const g: Record<string, PipelineEntry[]> = {};
    for (const s of stages) g[s.key] = [];
    for (const e of entries) {
      if (g[e.stage]) g[e.stage].push(e);
    }
    return g;
  }, [entries, stages]);

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

  return (
    <PageContainer>
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Jobs
      </Link>
      <PageHeader
        eyebrow={job.clients?.name ?? "Pipeline"}
        title={job.title}
        description={job.location ?? undefined}
        actions={
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
                  <Button size="icon" variant="ghost" className="h-9 w-9"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => updateStatus("open")} disabled={job.status === "open"}>
                    Open
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
                  <DropdownMenuItem onClick={() => setStagesOpen(true)}>
                    <Settings2 className="h-4 w-4" /> Customise stages
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" /> Delete job
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

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
