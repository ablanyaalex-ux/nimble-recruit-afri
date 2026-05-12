import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Video, MapPin, CalendarClock } from "lucide-react";

type Row = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  job_candidate_id: string;
  job_candidates: { job_id: string; candidates: { full_name: string } | null } | null;
};

export function UpcomingInterviewsWidget({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user || !currentWorkspaceId) return;
    (async () => {
      const { data } = await supabase
        .from("interview_schedules")
        .select("id, scheduled_at, duration_minutes, job_candidate_id, job_candidates(job_id, candidates(full_name))")
        .eq("workspace_id", currentWorkspaceId)
        .eq("status", "scheduled")
        .contains("interviewer_ids", [user.id])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3);
      setRows((data ?? []) as any);
    })();
  }, [user?.id, currentWorkspaceId]);

  if (collapsed || rows.length === 0) return null;

  return (
    <div className="px-2 py-3 border-t border-sidebar-border">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 mb-2 flex items-center gap-1">
        <CalendarClock className="h-3 w-3" /> Upcoming interviews
      </div>
      <div className="space-y-1 max-h-44 overflow-y-auto">
        {rows.map((r) => {
          const start = new Date(r.scheduled_at);
          const end = new Date(start.getTime() + r.duration_minutes * 60_000);
          const hh = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          const cand = r.job_candidates?.candidates?.full_name ?? "Candidate";
          const jobId = r.job_candidates?.job_id;
          const target = jobId ? `/jobs/${jobId}/candidates/${r.job_candidate_id}?tab=interviews` : "/interviews";
          const isToday = start.toDateString() === new Date().toDateString();
          return (
            <Link
              key={r.id}
              to={target}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors"
            >
              <Video className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{cand}</div>
                <div className="text-[10px] text-muted-foreground">
                  {isToday ? "Today" : start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} • {hh(start)}–{hh(end)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
