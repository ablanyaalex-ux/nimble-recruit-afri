import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Copy, Users, X, RefreshCw, CalendarDays } from "lucide-react";
import { toast } from "sonner";

type Schedule = {
  id: string;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number;
  interviewer_ids: string[];
  schedule_token: string;
};

export function CandidateInterviewsTab({
  jobCandidateId, onSchedule, onReschedule,
}: { jobCandidateId: string; onSchedule: () => void; onReschedule?: (id: string) => void }) {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("interview_schedules")
      .select("id, status, scheduled_at, duration_minutes, interviewer_ids, schedule_token")
      .eq("job_candidate_id", jobCandidateId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Schedule[];
    setRows(list);
    const ids = Array.from(new Set(list.flatMap((r) => r.interviewer_ids ?? [])));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of profs ?? []) map[p.id] = p.display_name ?? "Member";
      setProfiles(map);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [jobCandidateId]);

  function copyLink(token: string) {
    const url = `${window.location.origin}/schedule/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this interview?")) return;
    const { error } = await supabase.from("interview_schedules").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Interview cancelled");
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="font-display text-lg">No interview scheduled yet</div>
        <p className="text-sm text-muted-foreground">Schedule the first round to send the candidate a self-scheduling link.</p>
        <Button onClick={onSchedule}><CalendarPlus className="h-4 w-4 mr-1.5" /> Schedule first interview</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onSchedule}><CalendarPlus className="h-4 w-4 mr-1.5" /> Schedule another</Button>
      </div>
      {rows.map((r) => {
        const link = `${window.location.origin}/schedule/${r.schedule_token}`;
        const interviewers = (r.interviewer_ids ?? []).map((id) => profiles[id] ?? "Member");
        return (
          <Card key={r.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "scheduled" ? "default" : r.status === "cancelled" ? "outline" : "secondary"}>
                  {r.status.replace("_", " ")}
                </Badge>
                <div className="text-sm">
                  {r.scheduled_at ? (
                    <span className="font-medium">{new Date(r.scheduled_at).toLocaleString()}</span>
                  ) : (
                    <span className="text-muted-foreground">Awaiting candidate</span>
                  )}
                  <span className="text-muted-foreground"> • {r.duration_minutes} min</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === "pending_scheduling" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copyLink(r.schedule_token)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel(r.id)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </>
                )}
                {r.status === "scheduled" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onReschedule?.(r.id)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reschedule
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel(r.id)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
            {r.status === "pending_scheduling" && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 break-all">{link}</div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              <Users className="h-3.5 w-3.5" />
              {interviewers.length === 0 ? "No interviewers" : interviewers.map((n, i) => (
                <Badge key={i} variant="secondary" className="font-normal">{n}</Badge>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
