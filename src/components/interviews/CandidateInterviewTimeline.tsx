import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Clock, Users, XCircle, FileCheck2 } from "lucide-react";

type Schedule = {
  id: string;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number;
  interviewer_ids: string[];
  created_at: string;
  stage_id: string | null;
};

type Scorecard = {
  id: string;
  interview_id: string;
  interviewer_id: string;
  overall_recommendation: string | null;
  notes: string | null;
  submitted_at: string | null;
};

type Stage = { id: string; label: string };

export function CandidateInterviewTimeline({ jobCandidateId }: { jobCandidateId: string }) {
  const [interviews, setInterviews] = useState<Schedule[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from("interview_schedules")
        .select("id, status, scheduled_at, duration_minutes, interviewer_ids, created_at, stage_id")
        .eq("job_candidate_id", jobCandidateId)
        .order("created_at", { ascending: true });
      const list = (rows ?? []) as Schedule[];
      setInterviews(list);

      const ids = list.map((r) => r.id);
      const interviewerIds = Array.from(new Set(list.flatMap((r) => r.interviewer_ids ?? [])));
      const stageIds = Array.from(new Set(list.map((r) => r.stage_id).filter(Boolean) as string[]));

      const [scRes, profRes, stageRes] = await Promise.all([
        ids.length
          ? supabase
              .from("interview_scorecards")
              .select("id, interview_id, interviewer_id, overall_recommendation, notes, submitted_at")
              .in("interview_id", ids)
          : Promise.resolve({ data: [] as Scorecard[] }),
        interviewerIds.length
          ? supabase.from("profiles").select("id, display_name").in("id", interviewerIds)
          : Promise.resolve({ data: [] as any[] }),
        stageIds.length
          ? supabase.from("workspace_pipeline_stages").select("id, label").in("id", stageIds)
          : Promise.resolve({ data: [] as Stage[] }),
      ]);
      setScorecards((scRes.data ?? []) as Scorecard[]);
      const pmap: Record<string, string> = {};
      for (const p of (profRes.data ?? []) as any[]) pmap[p.id] = p.display_name ?? "Member";
      setProfiles(pmap);
      const smap: Record<string, string> = {};
      for (const s of (stageRes.data ?? []) as Stage[]) smap[s.id] = s.label;
      setStages(smap);
      setLoading(false);
    })();
  }, [jobCandidateId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading timeline…</p>;

  if (interviews.length === 0) {
    return (
      <Card className="p-8 text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="font-display text-lg">No interview history yet</div>
        <p className="text-sm text-muted-foreground">Once interviews are scheduled, the full chronology appears here.</p>
      </Card>
    );
  }

  // Build chronological events
  type Event = {
    key: string;
    at: Date;
    kind: "created" | "scheduled" | "cancelled" | "completed" | "scorecard";
    interview: Schedule;
    scorecard?: Scorecard;
  };
  const events: Event[] = [];
  const now = Date.now();
  for (const i of interviews) {
    events.push({ key: `${i.id}-c`, at: new Date(i.created_at), kind: "created", interview: i });
    if (i.status === "cancelled") {
      events.push({ key: `${i.id}-x`, at: new Date(i.created_at), kind: "cancelled", interview: i });
    } else if (i.scheduled_at) {
      const sd = new Date(i.scheduled_at);
      events.push({ key: `${i.id}-s`, at: sd, kind: "scheduled", interview: i });
      if (sd.getTime() + i.duration_minutes * 60_000 < now) {
        events.push({ key: `${i.id}-done`, at: new Date(sd.getTime() + i.duration_minutes * 60_000), kind: "completed", interview: i });
      }
    }
    for (const sc of scorecards.filter((s) => s.interview_id === i.id && s.submitted_at)) {
      events.push({ key: `sc-${sc.id}`, at: new Date(sc.submitted_at as string), kind: "scorecard", interview: i, scorecard: sc });
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden />
      <ul className="space-y-5">
        {events.map((e) => {
          const stageLabel = e.interview.stage_id ? stages[e.interview.stage_id] : null;
          const interviewers = (e.interview.interviewer_ids ?? []).map((id) => profiles[id] ?? "Member");
          const Icon =
            e.kind === "created" ? CalendarDays :
            e.kind === "scheduled" ? Clock :
            e.kind === "completed" ? CheckCircle2 :
            e.kind === "cancelled" ? XCircle :
            FileCheck2;
          const tone =
            e.kind === "completed" ? "text-emerald-600 bg-emerald-500/10" :
            e.kind === "cancelled" ? "text-destructive bg-destructive/10" :
            e.kind === "scorecard" ? "text-primary bg-primary/10" :
            "text-muted-foreground bg-muted";
          return (
            <li key={e.key} className="relative">
              <span className={`absolute -left-[17px] top-1 h-5 w-5 rounded-full grid place-items-center ring-4 ring-background ${tone}`}>
                <Icon className="h-3 w-3" />
              </span>
              <div className="text-xs text-muted-foreground">{fmt(e.at)}</div>
              <Card className="p-3 mt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium capitalize">
                    {e.kind === "created" && "Interview created"}
                    {e.kind === "scheduled" && (new Date(e.interview.scheduled_at as string).getTime() > now ? "Interview scheduled" : "Interview held")}
                    {e.kind === "completed" && "Interview completed"}
                    {e.kind === "cancelled" && "Interview cancelled"}
                    {e.kind === "scorecard" && `Scorecard submitted by ${profiles[e.scorecard!.interviewer_id] ?? "Interviewer"}`}
                  </span>
                  {stageLabel && <Badge variant="outline" className="text-[10px]">{stageLabel}</Badge>}
                  {e.kind === "scorecard" && e.scorecard?.overall_recommendation && (
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      {e.scorecard.overall_recommendation.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                {(e.kind === "created" || e.kind === "scheduled") && interviewers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                    <Users className="h-3 w-3" /> {interviewers.join(", ")}
                    <span className="opacity-60">• {e.interview.duration_minutes} min</span>
                  </div>
                )}
                {e.kind === "scorecard" && e.scorecard?.notes && (
                  <p className="text-sm mt-1.5 whitespace-pre-wrap">{e.scorecard.notes}</p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
