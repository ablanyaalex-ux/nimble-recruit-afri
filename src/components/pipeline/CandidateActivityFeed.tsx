import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRight, Mail, Trash2, UserCog, UserPlus, RotateCcw, FileText, Link2, MessageSquare, Award, Send, CheckCircle2, XCircle, Tag as TagIcon, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";

type Log = {
  id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  metadata: any;
  created_at: string;
  actor_id: string | null;
};

type Stage = { key: string; label: string };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTION_META: Record<string, { Icon: any; tone: string }> = {
  stage_changed: { Icon: ArrowRight, tone: "text-primary bg-primary/10" },
  candidate_added: { Icon: UserPlus, tone: "text-emerald-600 bg-emerald-500/10" },
  rejected: { Icon: Trash2, tone: "text-destructive bg-destructive/10" },
  unrejected: { Icon: RotateCcw, tone: "text-amber-600 bg-amber-500/10" },
  email_sent: { Icon: Mail, tone: "text-sky-600 bg-sky-500/10" },
  recruiter_assigned: { Icon: UserCog, tone: "text-primary bg-primary/10" },
  document_uploaded: { Icon: FileText, tone: "text-indigo-600 bg-indigo-500/10" },
  assessment_added: { Icon: Link2, tone: "text-violet-600 bg-violet-500/10" },
  comment_added: { Icon: MessageSquare, tone: "text-foreground bg-muted" },
  offer_generated: { Icon: Award, tone: "text-amber-600 bg-amber-500/10" },
  offer_submitted_for_approval: { Icon: Award, tone: "text-amber-600 bg-amber-500/10" },
  offer_approved: { Icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
  offer_sent: { Icon: Send, tone: "text-sky-600 bg-sky-500/10" },
  offer_accepted: { Icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
  offer_declined: { Icon: XCircle, tone: "text-destructive bg-destructive/10" },
  tag_added: { Icon: TagIcon, tone: "text-violet-600 bg-violet-500/10" },
  archived: { Icon: Archive, tone: "text-muted-foreground bg-muted" },
  unarchived: { Icon: ArchiveRestore, tone: "text-emerald-600 bg-emerald-500/10" },
};

export function CandidateActivityFeed({
  jobCandidateId,
  stages,
  refreshKey = 0,
}: {
  jobCandidateId: string;
  stages: Stage[];
  refreshKey?: number;
}) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const stageLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of stages) m[s.key] = s.label;
    return m;
  }, [stages]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, action_type, from_value, to_value, metadata, created_at, actor_id")
        .eq("job_candidate_id", jobCandidateId)
        .order("created_at", { ascending: false });
      if (!active) return;
      const list = (data ?? []) as Log[];
      setLogs(list);

      const ids = Array.from(new Set(list.map((l) => l.actor_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
        const m: Record<string, string> = {};
        for (const p of (profs ?? []) as any[]) m[p.id] = p.display_name ?? "Member";
        if (active) setProfiles(m);
      }
    })();

    const ch = supabase
      .channel(`activity-${jobCandidateId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `job_candidate_id=eq.${jobCandidateId}` },
        (payload) => {
          const row = payload.new as Log;
          setLogs((prev) => [row, ...prev]);
          if (row.actor_id && !profiles[row.actor_id]) {
            supabase.from("profiles").select("id, display_name").eq("id", row.actor_id).maybeSingle().then(({ data }) => {
              if (data) setProfiles((p) => ({ ...p, [data.id]: (data as any).display_name ?? "Member" }));
            });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCandidateId, refreshKey]);

  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No activity yet. Stage changes, rejections, and messages will appear here.
      </Card>
    );
  }

  const describe = (l: Log): React.ReactNode => {
    const actor = (l.actor_id && profiles[l.actor_id]) || "Someone";
    switch (l.action_type) {
      case "stage_changed":
        return (
          <>
            <strong>{actor}</strong> moved candidate to{" "}
            <strong>{stageLabel[l.to_value ?? ""] ?? l.to_value}</strong>
            {l.from_value && (
              <span className="text-muted-foreground"> from {stageLabel[l.from_value] ?? l.from_value}</span>
            )}
          </>
        );
      case "candidate_added":
        return (
          <>
            <strong>{actor}</strong> added candidate to pipeline at{" "}
            <strong>{stageLabel[l.to_value ?? ""] ?? l.to_value}</strong>
          </>
        );
      case "rejected":
        return (
          <>
            <strong>{actor}</strong> rejected the candidate
            {l.metadata?.reason && <span className="text-muted-foreground"> — {l.metadata.reason}</span>}
          </>
        );
      case "unrejected":
        return <><strong>{actor}</strong> reinstated the candidate</>;
      case "email_sent":
        return (
          <>
            <strong>{actor}</strong> sent an email
            {l.metadata?.subject && <span className="text-muted-foreground"> — “{l.metadata.subject}”</span>}
          </>
        );
      case "document_uploaded":
        return (
          <>
            <strong>{actor}</strong> uploaded document <strong>{l.to_value}</strong>
            {l.metadata?.category && <span className="text-muted-foreground"> ({l.metadata.category})</span>}
          </>
        );
      case "assessment_added":
        return (
          <>
            <strong>{actor}</strong> added assessment link <strong>{l.to_value}</strong>
          </>
        );
      case "comment_added":
        return (
          <>
            <strong>{actor}</strong> added a comment
            {l.metadata?.preview && <span className="text-muted-foreground"> — “{l.metadata.preview}”</span>}
          </>
        );
      case "offer_generated":
        return <><strong>{actor}</strong> generated an offer</>;
      case "offer_submitted_for_approval":
        return <><strong>{actor}</strong> submitted the offer for internal approval</>;
      case "offer_approved":
        return <><strong>{actor}</strong> approved the offer</>;
      case "offer_sent":
        return <><strong>{actor}</strong> sent the offer to the candidate</>;
      case "offer_accepted":
        return <><strong>{actor}</strong> — candidate accepted the offer 🎉</>;
      case "offer_declined":
        return <><strong>{actor}</strong> — candidate declined the offer{l.metadata?.reason && <span className="text-muted-foreground"> — {l.metadata.reason}</span>}</>;
      case "tag_added":
        return <><strong>{actor}</strong> tagged candidate <strong>{l.to_value ?? l.metadata?.tag}</strong></>;
      case "archived":
        return <><strong>{actor}</strong> archived the candidate</>;
      case "unarchived":
        return <><strong>{actor}</strong> restored the candidate</>;
      default:
        return <><strong>{actor}</strong> {l.action_type.replace(/_/g, " ")}</>;
    }
  };

  return (
    <div className="space-y-2">
      {logs.map((l) => {
        const meta = ACTION_META[l.action_type] ?? { Icon: ArrowRight, tone: "text-muted-foreground bg-muted" };
        const Icon = meta.Icon;
        const actor = (l.actor_id && profiles[l.actor_id]) || "—";
        const initials = actor.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        return (
          <Card key={l.id} className="p-3 flex gap-3 items-start">
            <span className={cn("h-8 w-8 shrink-0 rounded-full grid place-items-center", meta.tone)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{describe(l)}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <Avatar className="h-4 w-4"><AvatarFallback className="text-[8px]">{initials || "·"}</AvatarFallback></Avatar>
                <span>{relativeTime(l.created_at)}</span>
                {l.action_type === "email_sent" && l.metadata?.thread_id && (
                  <Link to={`/inbox?thread=${l.metadata.thread_id}`} className="text-primary hover:underline ml-1">
                    View message
                  </Link>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
