import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader, PageContainer } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ClipboardList, Settings2, Send, AlertCircle } from "lucide-react";
import { InterviewerAvailabilityDialog } from "@/components/interviews/InterviewerAvailabilityDialog";
import { toast } from "sonner";

type Row = {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number;
  status: string;
  interviewer_ids: string[];
  job_candidate_id: string;
  job_candidates: {
    job_id: string;
    candidates: { full_name: string } | null;
    jobs: { id: string; title: string } | null;
  } | null;
  scorecards?: Array<{ id: string; interviewer_id: string; submitted_at: string | null }>;
};

function statusBadge(status: string) {
  if (status === "scheduled") return <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30">Scheduled</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Completed</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="secondary">{status.replace("_", " ")}</Badge>;
}

export default function MyInterviews() {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<Row[]>([]);
  const [openAvail, setOpenAvail] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);

  async function load() {
    if (!user || !currentWorkspaceId) return;
    let q = supabase
      .from("interview_schedules")
      .select("id, scheduled_at, duration_minutes, status, interviewer_ids, job_candidate_id, job_candidates(job_id, candidates(full_name), jobs(id, title))")
      .eq("workspace_id", currentWorkspaceId)
      .order("scheduled_at", { ascending: true });
    if (scope === "mine") q = q.contains("interviewer_ids", [user.id]);
    const { data } = await q;
    const list = (data ?? []) as any[];

    const ids = list.map((r) => r.id);
    let scByInterview = new Map<string, any[]>();
    if (ids.length) {
      const { data: scs } = await supabase
        .from("interview_scorecards")
        .select("id, interview_id, interviewer_id, submitted_at")
        .in("interview_id", ids);
      for (const s of scs ?? []) {
        if (!scByInterview.has(s.interview_id)) scByInterview.set(s.interview_id, []);
        scByInterview.get(s.interview_id)!.push(s);
      }
    }
    setRows(list.map((r) => ({ ...r, scorecards: scByInterview.get(r.id) ?? [] })));

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("workspace_id", currentWorkspaceId)
      .order("title");
    setJobs((jobsData ?? []) as any);
  }
  useEffect(() => { load(); }, [user?.id, currentWorkspaceId, scope]);

  const filtered = useMemo(() => {
    return rows.filter((r) => jobFilter === "all" || r.job_candidates?.job_id === jobFilter);
  }, [rows, jobFilter]);

  // Pending scorecards: ended in the last 48h, not all interviewers have submitted
  const pendingScorecards = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (!r.scheduled_at) return false;
      const end = new Date(r.scheduled_at).getTime() + r.duration_minutes * 60_000;
      const within48h = end < now && now - end < 48 * 3600_000;
      if (!within48h) return false;
      const submittedIds = new Set((r.scorecards ?? []).filter((s) => s.submitted_at).map((s) => s.interviewer_id));
      return r.interviewer_ids.some((id) => !submittedIds.has(id));
    });
  }, [rows]);

  async function sendReminder(r: Row) {
    if (!currentWorkspaceId) return;
    const submittedIds = new Set((r.scorecards ?? []).filter((s) => s.submitted_at).map((s) => s.interviewer_id));
    const missing = r.interviewer_ids.filter((id) => !submittedIds.has(id));
    if (missing.length === 0) return;
    const candName = r.job_candidates?.candidates?.full_name ?? "the candidate";
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", missing);
    // We can't read auth.users emails from client; queue with payload that the worker resolves via interviewer id.
    // Fallback: queue email to placeholder; the interview-scheduling/process-automations functions already handle interviewer emails server-side.
    // Here we insert one queue row per missing interviewer including their user_id so the worker can resolve email.
    const inserts = missing.map((uid) => ({
      workspace_id: currentWorkspaceId,
      payload: {
        interviewer_user_id: uid,
        subject: `Reminder: scorecard for ${candName}`,
        body: `Hi,\n\nA quick reminder to complete your scorecard for ${candName}. It only takes a minute.\n\nLink: ${window.location.origin}/interviews/${r.id}/scorecard/${uid}`,
      },
      status: "pending",
    }));
    const { error } = await supabase.from("outbound_email_queue").insert(inserts);
    if (error) return toast.error(error.message);
    toast.success(`Reminder queued for ${missing.length} interviewer${missing.length === 1 ? "" : "s"}.`);
  }

  function renderList(list: Row[]) {
    if (list.length === 0) {
      return <Card className="p-8 text-center text-muted-foreground">No interviews to show.</Card>;
    }
    // Group by date
    const byDay = new Map<string, Row[]>();
    for (const r of list) {
      const k = r.scheduled_at ? new Date(r.scheduled_at).toDateString() : "Pending scheduling";
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(r);
    }
    return (
      <div className="space-y-5">
        {Array.from(byDay.entries()).map(([day, items]) => (
          <div key={day}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{day}</div>
            <div className="space-y-2">
              {items.map((r) => {
                const cand = r.job_candidates?.candidates?.full_name ?? "Candidate";
                const jobTitle = r.job_candidates?.jobs?.title ?? "";
                const myCard = (r.scorecards ?? []).find((s) => s.interviewer_id === user?.id);
                const missingAny = r.interviewer_ids.some((id) => !(r.scorecards ?? []).find((s) => s.interviewer_id === id && s.submitted_at));
                return (
                  <Card key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{cand} <span className="text-muted-foreground">— {jobTitle}</span></div>
                        <div className="text-xs text-muted-foreground">
                          {r.scheduled_at ? new Date(r.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Awaiting candidate"} • {r.duration_minutes} min
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(r.status)}
                      {r.status === "scheduled" && Date.now() > new Date(r.scheduled_at!).getTime() + r.duration_minutes * 60_000 && missingAny && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">Missing scorecard</Badge>
                      )}
                      {r.interviewer_ids.includes(user?.id ?? "") && r.status === "scheduled" && (
                        <Button asChild size="sm" variant={myCard?.submitted_at ? "outline" : "default"}>
                          <Link to={`/interviews/${r.id}/scorecard/${user?.id}`}>
                            <ClipboardList className="h-4 w-4 mr-1.5" />
                            {myCard?.submitted_at ? "View scorecard" : "Complete scorecard"}
                          </Link>
                        </Button>
                      )}
                      {r.job_candidates?.job_id && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/app/jobs/${r.job_candidates.job_id}/candidates/${r.job_candidate_id}?tab=interviews`}>Open</Link>
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Schedule"
        title="Interview Command Center"
        description="Track every interview across the workspace, complete scorecards and chase missing feedback."
        actions={
          <Button variant="outline" onClick={() => setOpenAvail(true)}>
            <Settings2 className="h-4 w-4 mr-2" /> My availability
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My interviews</SelectItem>
            <SelectItem value="all">All interviews</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Pending scorecards
            {pendingScorecards.length > 0 && <Badge variant="destructive" className="ml-1 h-4 text-[10px] px-1.5">{pendingScorecards.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          {renderList(filtered.filter((r) => r.status === "scheduled" && r.scheduled_at && new Date(r.scheduled_at).getTime() >= Date.now()))}
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          {renderList(filtered)}
        </TabsContent>
        <TabsContent value="pending" className="mt-4 space-y-3">
          {pendingScorecards.length === 0 && <Card className="p-8 text-center text-muted-foreground">All scorecards are in. Nice work.</Card>}
          {pendingScorecards.map((r) => {
            const cand = r.job_candidates?.candidates?.full_name ?? "Candidate";
            const jobTitle = r.job_candidates?.jobs?.title ?? "";
            const submittedIds = new Set((r.scorecards ?? []).filter((s) => s.submitted_at).map((s) => s.interviewer_id));
            const missing = r.interviewer_ids.filter((id) => !submittedIds.has(id));
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium">{cand} <span className="text-muted-foreground">— {jobTitle}</span></div>
                  <div className="text-xs text-muted-foreground">
                    Ended {r.scheduled_at ? new Date(new Date(r.scheduled_at).getTime() + r.duration_minutes * 60_000).toLocaleString() : "—"}
                    {" • "}{missing.length} missing scorecard{missing.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => sendReminder(r)}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Send reminder
                </Button>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <InterviewerAvailabilityDialog open={openAvail} onOpenChange={setOpenAvail} />
    </PageContainer>
  );
}
