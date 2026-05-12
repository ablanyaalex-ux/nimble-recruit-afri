import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ClipboardList, Settings2 } from "lucide-react";
import { InterviewerAvailabilityDialog } from "@/components/interviews/InterviewerAvailabilityDialog";

type Row = {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number;
  status: string;
  job_candidates: {
    candidates: { full_name: string } | null;
    jobs: { title: string } | null;
  } | null;
  scorecard?: { id: string; submitted_at: string | null } | null;
};

export default function MyInterviews() {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<Row[]>([]);
  const [openAvail, setOpenAvail] = useState(false);

  async function load() {
    if (!user || !currentWorkspaceId) return;
    const { data } = await supabase
      .from("interview_schedules")
      .select("id, scheduled_at, duration_minutes, status, interviewer_ids, job_candidates(candidates(full_name), jobs(title))")
      .eq("workspace_id", currentWorkspaceId)
      .contains("interviewer_ids", [user.id])
      .order("scheduled_at", { ascending: true });
    const list = (data ?? []) as any[];
    // Pull scorecards for these interviews for current user
    const ids = list.map((r) => r.id);
    let scorecardsByInterview = new Map<string, any>();
    if (ids.length) {
      const { data: scs } = await supabase
        .from("interview_scorecards")
        .select("id, interview_id, submitted_at")
        .in("interview_id", ids)
        .eq("interviewer_id", user.id);
      scorecardsByInterview = new Map((scs ?? []).map((s: any) => [s.interview_id, s]));
    }
    setRows(list.map((r) => ({ ...r, scorecard: scorecardsByInterview.get(r.id) ?? null })));
  }
  useEffect(() => { load(); }, [user?.id, currentWorkspaceId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title="My Interviews"
        actions={
          <Button variant="outline" onClick={() => setOpenAvail(true)}>
            <Settings2 className="h-4 w-4 mr-2" /> My availability
          </Button>
        }
      />
      <div className="space-y-3">
        {rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            No interviews assigned to you yet.
          </Card>
        )}
        {rows.map((r) => {
          const cand = r.job_candidates?.candidates?.full_name ?? "Candidate";
          const job = r.job_candidates?.jobs?.title ?? "";
          return (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{cand} <span className="text-muted-foreground">— {job}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "Pending scheduling"} • {r.duration_minutes} min
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "scheduled" ? "default" : "secondary"}>{r.status.replace("_", " ")}</Badge>
                {r.status === "scheduled" && (
                  <Button asChild size="sm" variant={r.scorecard?.submitted_at ? "outline" : "default"}>
                    <Link to={`/interviews/${r.id}/scorecard/${user?.id}`}>
                      <ClipboardList className="h-4 w-4 mr-1.5" />
                      {r.scorecard?.submitted_at ? "View scorecard" : "Complete scorecard"}
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <InterviewerAvailabilityDialog open={openAvail} onOpenChange={setOpenAvail} />
    </div>
  );
}
