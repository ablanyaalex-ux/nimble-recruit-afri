import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { groupStagesByMilestone, type MilestoneGroup } from "@/lib/milestones";
import type { PipelineStage } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Log = { action_type: string; from_value: string | null; to_value: string | null; created_at: string };

export function CandidateStagesTimeline({
  jobCandidateId,
  stages,
  currentStage,
  refreshKey = 0,
}: {
  jobCandidateId: string;
  stages: PipelineStage[];
  currentStage: string;
  refreshKey?: number;
}) {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("action_type, from_value, to_value, created_at")
        .eq("job_candidate_id", jobCandidateId)
        .in("action_type", ["stage_changed", "candidate_added"])
        .order("created_at", { ascending: true });
      setLogs((data ?? []) as Log[]);
    })();
  }, [jobCandidateId, refreshKey]);

  const groups = useMemo(() => groupStagesByMilestone(stages), [stages]);

  // Determine for each milestone: enteredAt, exitedAt
  type MStat = { entered?: Date; exited?: Date };
  const stageStats = useMemo(() => {
    const byStage = new Map<string, { entered?: Date; exited?: Date }>();
    for (const s of stages) byStage.set(s.key, {});
    // Walk logs chronologically
    for (const l of logs) {
      if (l.action_type === "candidate_added" && l.to_value) {
        const cur = byStage.get(l.to_value) ?? {};
        cur.entered = cur.entered ?? new Date(l.created_at);
        byStage.set(l.to_value, cur);
      } else if (l.action_type === "stage_changed") {
        if (l.from_value) {
          const f = byStage.get(l.from_value) ?? {};
          f.exited = new Date(l.created_at);
          byStage.set(l.from_value, f);
        }
        if (l.to_value) {
          const t = byStage.get(l.to_value) ?? {};
          t.entered = t.entered ?? new Date(l.created_at);
          byStage.set(l.to_value, t);
        }
      }
    }
    return byStage;
  }, [logs, stages]);

  const currentIdx = stages.findIndex((s) => s.key === currentStage);

  const milestoneStatus = (g: MilestoneGroup): "completed" | "active" | "upcoming" => {
    const indices = g.stages.map((s) => stages.findIndex((x) => x.key === s.key));
    const min = Math.min(...indices), max = Math.max(...indices);
    if (currentIdx > max) return "completed";
    if (currentIdx >= min && currentIdx <= max) return "active";
    return "upcoming";
  };

  const fmt = (d?: Date) =>
    d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  return (
    <div className="space-y-2">
      {groups.map((g, gi) => {
        const status = milestoneStatus(g);
        const isLast = gi === groups.length - 1;
        const Icon = status === "completed" ? CheckCircle2 : status === "active" ? Clock : Circle;
        const tone =
          status === "completed"
            ? "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20"
            : status === "active"
            ? "text-primary bg-primary/10 ring-primary/30"
            : "text-muted-foreground bg-muted ring-border";
        const lineClass = status === "completed" ? "bg-emerald-500/40" : "border-l-2 border-dashed border-border";

        return (
          <div key={g.key} className="relative pl-10">
            <span
              className={cn(
                "absolute left-0 top-1 h-7 w-7 rounded-full grid place-items-center ring-4 ring-background",
                tone,
                status === "active" && "animate-pulse"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[13px] top-9 bottom-[-12px] w-px",
                  status === "completed" ? "bg-emerald-500/40" : "border-l-2 border-dashed border-border"
                )}
                aria-hidden
              />
            )}
            <Card
              className={cn(
                "p-4",
                status === "active" && "border-primary border-2 shadow-sm"
              )}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-display text-base">{g.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.stages.length} stage{g.stages.length === 1 ? "" : "s"}
                  </div>
                </div>
                {status === "active" && (
                  <Badge className="bg-primary/15 text-primary border-transparent">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Current
                  </Badge>
                )}
                {status === "completed" && (
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Completed
                  </Badge>
                )}
              </div>
              <ul className="mt-3 space-y-1.5">
                {g.stages.map((s) => {
                  const stat = stageStats.get(s.key) ?? {};
                  const isCurrent = s.key === currentStage;
                  const sIdx = stages.findIndex((x) => x.key === s.key);
                  const sStatus = sIdx < currentIdx ? "completed" : isCurrent ? "active" : "upcoming";
                  return (
                    <li key={s.key} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {sStatus === "completed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : sStatus === "active" ? (
                          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                        <span className={cn(isCurrent && "font-medium")}>{s.label}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {stat.entered ? fmt(stat.entered) : "—"}
                        {stat.exited ? ` – ${fmt(stat.exited)}` : isCurrent ? " – present" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
