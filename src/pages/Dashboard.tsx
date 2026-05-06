import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Users, CalendarClock, Activity, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/integrations/supabase/client";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { isHiringManager } from "@/lib/permissions";
import { jobStatusBadgeClass, jobStatusLabel } from "@/lib/jobStatus";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type RecentJob = {
  id: string;
  title: string;
  status: string;
  reference: string | null;
  clients: { name: string } | null;
};

type StageCount = { stage: string; count: number };

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

export default function Dashboard() {
  const { user } = useAuth();
  const { memberships, currentWorkspaceId, currentRole } = useWorkspace();
  const ws = memberships.find((m) => m.workspace_id === currentWorkspaceId);
  const greeting = (user?.user_metadata?.display_name as string) || user?.email?.split("@")[0] || "there";
  const hm = isHiringManager(currentRole);

  const { stages } = usePipelineStages(currentWorkspaceId);
  const [openJobs, setOpenJobs] = useState<number | null>(null);
  const [totalJobs, setTotalJobs] = useState<number | null>(null);
  const [candidatesCount, setCandidatesCount] = useState<number | null>(null);
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let assignedJobIds: string[] | null = null;
      if (hm && user) {
        const { data: contactRows } = await supabase.from("client_contacts").select("id").eq("user_id", user.id);
        const contactIds = (contactRows ?? []).map((row) => row.id);
        if (contactIds.length === 0) assignedJobIds = [];
        else {
          const { data: assignments } = await supabase
            .from("job_hiring_managers")
            .select("job_id")
            .in("contact_id", contactIds);
          assignedJobIds = Array.from(new Set((assignments ?? []).map((row) => row.job_id)));
        }
      }

      if (hm && assignedJobIds?.length === 0) {
        if (cancelled) return;
        setOpenJobs(0);
        setTotalJobs(0);
        setCandidatesCount(null);
        setStageCounts([]);
        setRecentJobs([]);
        setLoading(false);
        return;
      }

      let openQ = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", currentWorkspaceId)
        .eq("status", "open");
      let totalQ = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", currentWorkspaceId);
      let jcQ = supabase
        .from("job_candidates")
        .select("stage, jobs!inner(workspace_id)")
        .eq("jobs.workspace_id", currentWorkspaceId);
      let recentQ = supabase
        .from("jobs")
        .select("id, title, status, reference, clients(name)")
        .eq("workspace_id", currentWorkspaceId)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (hm && assignedJobIds) {
        openQ = openQ.in("id", assignedJobIds);
        totalQ = totalQ.in("id", assignedJobIds);
        jcQ = jcQ.in("job_id", assignedJobIds);
        recentQ = recentQ.in("id", assignedJobIds);
      }

      const [openRes, totalRes, candRes, jcRes, recentRes] = await Promise.all([
        openQ,
        totalQ,
        hm
          ? Promise.resolve({ count: null as number | null })
          : supabase
              .from("candidates")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", currentWorkspaceId),
        jcQ,
        recentQ,
      ]);
      if (cancelled) return;
      setOpenJobs(openRes.count ?? 0);
      setTotalJobs(totalRes.count ?? 0);
      setCandidatesCount(candRes.count ?? null);

      const counts = new Map<string, number>();
      for (const row of (jcRes.data ?? []) as Array<{ stage: string }>) {
        counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
      }
      setStageCounts(Array.from(counts.entries()).map(([stage, count]) => ({ stage, count })));

      setRecentJobs((recentRes.data ?? []) as unknown as RecentJob[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, hm, user?.id]);

  // Active interviews = candidates currently sitting in any "interview"-named stage
  const interviewCount = useMemo(() => {
    if (!stages.length) return 0;
    const interviewKeys = new Set(
      stages
        .filter((s) => /interview/i.test(s.label) || /interview/i.test(s.key))
        .map((s) => s.key),
    );
    return stageCounts
      .filter((c) => interviewKeys.has(c.stage))
      .reduce((sum, c) => sum + c.count, 0);
  }, [stages, stageCounts]);

  const stageLabel = (key: string) =>
    stages.find((s) => s.key === key)?.label ?? key.replace(/_/g, " ");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Today"
        title={`Good to see you, ${greeting}.`}
        description={`You're signed in to ${ws?.workspaces.name ?? "your workspace"}. Your role: ${ws?.role ?? "member"}.`}
      />

      <div className="grid gap-4 md:gap-6 md:grid-cols-3 mb-6">
        <StatCard
          to="/jobs"
          icon={<Briefcase className="h-4 w-4" />}
          title="Open jobs"
          value={openJobs}
          loading={loading}
          hint={
            totalJobs !== null && openJobs !== null
              ? `${totalJobs - openJobs} other${totalJobs - openJobs === 1 ? "" : "s"} paused, closed or filled`
              : "Create your first job from the Jobs tab."
          }
        />
        <StatCard
          to="/candidates"
          icon={<Users className="h-4 w-4" />}
          title="Candidates"
          value={candidatesCount}
          loading={loading}
          hint={
            hm
              ? "Visible to recruiters in this workspace."
              : "All candidates across your jobs."
          }
        />
        <StatCard
          to="/jobs"
          icon={<CalendarClock className="h-4 w-4" />}
          title="In interviews"
          value={loading ? null : interviewCount}
          loading={loading}
          hint="Candidates currently in any interview stage."
        />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" /> Pipeline snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : stageCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No candidates in pipeline yet.
              </p>
            ) : (
              <div className="space-y-2">
                {stages.map((s) => {
                  const c = stageCounts.find((x) => x.stage === s.key)?.count ?? 0;
                  if (c === 0) return null;
                  return (
                    <div
                      key={s.key}
                      className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
                    >
                      <span className="text-muted-foreground">{stageLabel(s.key)}</span>
                      <span className="font-medium tabular-nums">{c}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" /> Recently updated jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {recentJobs.map((j) => (
                  <Link
                    key={j.id}
                    to={`/jobs/${j.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 group"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {j.title}
                        {j.reference && (
                          <span className="font-mono text-[10px] bg-secondary text-foreground/70 px-1.5 py-0.5 rounded">
                            {j.reference}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {j.clients?.name ?? "—"}
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${jobStatusBadgeClass(j.status)}`}>
                      {jobStatusLabel(j.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function StatCard({
  to,
  icon,
  title,
  value,
  hint,
  loading,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  value: number | null;
  hint: string;
  loading: boolean;
}) {
  return (
    <Link to={to} className="group">
      <Card className="border-border/80 shadow-none transition-colors group-hover:border-primary/40">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-base font-medium text-muted-foreground flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </CardHeader>
        <CardContent>
          {loading || value === null ? (
            <Skeleton className="h-10 w-16" />
          ) : (
            <div className="font-display text-4xl tabular-nums">{value}</div>
          )}
          <p className="text-sm text-muted-foreground mt-1">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
