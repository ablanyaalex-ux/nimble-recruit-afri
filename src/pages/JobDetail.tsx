import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { canEditWorkspace, canMoveStages, STAGE_LABELS, STAGES, type Stage } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CandidateDrawer } from "@/components/pipeline/CandidateDrawer";
import { toast } from "sonner";

type Job = {
  id: string;
  title: string;
  status: string;
  client_id: string;
  workspace_id: string;
  location: string | null;
  description: string | null;
  clients: { name: string } | null;
};

type PipelineEntry = {
  id: string;
  stage: Stage;
  candidate_id: string;
  candidates: { full_name: string; headline: string | null };
};

type CandidateOpt = { id: string; full_name: string };

function DraggableCard({ entry, canDrag, onClick }: { entry: PipelineEntry; canDrag: boolean; onClick: () => void }) {
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

function DroppableColumn({ stage, children }: { stage: Stage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
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
  const { user } = useAuth();
  const { currentRole } = useWorkspace();
  const canEdit = canEditWorkspace(currentRole);
  const canDrag = canMoveStages(currentRole);
  const [job, setJob] = useState<Job | null>(null);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [candidateOpts, setCandidateOpts] = useState<CandidateOpt[]>([]);
  const [chosenCandidate, setChosenCandidate] = useState<string>("");

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

  // Load candidates not already in pipeline
  useEffect(() => {
    const load = async () => {
      if (!job || !canEdit) return;
      const { data } = await supabase
        .from("candidates")
        .select("id, full_name")
        .eq("workspace_id", job.workspace_id)
        .order("full_name");
      const inPipeline = new Set(entries.map((e) => e.candidate_id));
      setCandidateOpts((data ?? []).filter((c) => !inPipeline.has(c.id)));
    };
    if (addOpen) load();
  }, [addOpen, job, entries, canEdit]);

  const grouped = useMemo(() => {
    const g: Record<Stage, PipelineEntry[]> = {
      sourced: [], contacted: [], screened: [], interview: [], offer: [], hired: [], rejected: [],
    };
    for (const e of entries) g[e.stage].push(e);
    return g;
  }, [entries]);

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const newStage = e.over.id as Stage;
    const entry = entries.find((x) => x.id === e.active.id);
    if (!entry || entry.stage === newStage) return;
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, stage: newStage } : x)));
    const { error } = await supabase.from("job_candidates").update({ stage: newStage }).eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      refresh();
    }
  };

  const addToPipeline = async () => {
    if (!job || !user || !chosenCandidate) return;
    const { error } = await supabase.from("job_candidates").insert({
      job_id: job.id,
      candidate_id: chosenCandidate,
      added_by: user.id,
      stage: "sourced",
    });
    if (error) return toast.error(error.message);
    toast.success("Added to pipeline.");
    setChosenCandidate("");
    setAddOpen(false);
    refresh();
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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{job.status.replace("_", " ")}</Badge>
            {canEdit && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" /> Add candidate</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add candidate to pipeline</DialogTitle></DialogHeader>
                  {candidateOpts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No candidates available. Create one from the Candidates page.</p>
                  ) : (
                    <>
                      <Select value={chosenCandidate} onValueChange={setChosenCandidate}>
                        <SelectTrigger><SelectValue placeholder="Choose candidate" /></SelectTrigger>
                        <SelectContent>
                          {candidateOpts.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <DialogFooter><Button onClick={addToPipeline} disabled={!chosenCandidate}>Add</Button></DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
          {STAGES.map((stage) => (
            <DroppableColumn key={stage} stage={stage}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </div>
                <span className="text-xs text-muted-foreground">{grouped[stage].length}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {grouped[stage].map((entry) => (
                  <DraggableCard
                    key={entry.id}
                    entry={entry}
                    canDrag={canDrag}
                    onClick={() => !canDrag && setActiveDrawer(entry.id)}
                  />
                ))}
              </div>
              {canDrag && grouped[stage].length > 0 && (
                <div className="mt-2 text-[10px] text-muted-foreground px-1">Tap a card to open</div>
              )}
            </DroppableColumn>
          ))}
        </div>
      </DndContext>

      {/* Click handler for draggable cards too — we open drawer on tap when not dragging */}
      <ClickableOverlay entries={entries} setActiveDrawer={setActiveDrawer} canDrag={canDrag} />

      <CandidateDrawer
        jobCandidateId={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        onChanged={refresh}
      />
    </PageContainer>
  );
}

// Helper: when drag is enabled the card swallows the click; expose a small "open" button via re-render.
// Simpler approach: also allow clicking the candidate name area separately.
function ClickableOverlay(_: { entries: PipelineEntry[]; setActiveDrawer: (id: string) => void; canDrag: boolean }) {
  return null;
}
