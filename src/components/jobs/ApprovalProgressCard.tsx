import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Circle, XCircle, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  step_order: number;
  approver_id: string;
  status: "waiting" | "pending" | "approved" | "rejected";
  decided_at: string | null;
  note: string | null;
};

export function ApprovalProgressCard({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("job_approval_steps")
      .select("id, step_order, approver_id, status, decided_at, note")
      .eq("job_id", jobId)
      .order("step_order");
    const rows = (data ?? []) as Step[];
    setSteps(rows);
    if (rows.length) {
      const ids = rows.map((s) => s.approver_id);
      const { data: ps } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      setProfiles(Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.display_name])));
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [jobId]);

  const nudge = async (stepId: string) => {
    setNudging(stepId);
    const { error } = await supabase.functions.invoke("process-automations", {
      body: { mode: "approval_nudge", stepId, publicUrl: window.location.origin },
    });
    setNudging(null);
    if (error) return toast.error("Could not send reminder");
    toast.success("Reminder email queued.");
  };

  if (loading || steps.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg">Approval progress</h3>
        <Badge variant="outline" className="text-xs">
          Step {Math.max(1, steps.findIndex((s) => s.status === "pending") + 1 || steps.length)} of {steps.length}
        </Badge>
      </div>
      <ol className="space-y-3">
        {steps.map((s) => {
          const name = profiles[s.approver_id] ?? "Unknown";
          const Icon = s.status === "approved" ? CheckCircle2
            : s.status === "rejected" ? XCircle
            : s.status === "pending" ? Clock
            : Circle;
          const color = s.status === "approved" ? "text-emerald-600"
            : s.status === "rejected" ? "text-destructive"
            : s.status === "pending" ? "text-amber-600"
            : "text-muted-foreground";
          return (
            <li key={s.id} className="flex items-start gap-3">
              <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">Step {s.step_order}: {name}</span>
                  <Badge variant="outline" className="capitalize text-xs">{s.status}</Badge>
                </div>
                {s.decided_at && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.status === "approved" ? "Approved" : "Rejected"} on {new Date(s.decided_at).toLocaleString()}
                  </div>
                )}
                {s.note && (
                  <div className="text-xs italic text-muted-foreground mt-1 border-l-2 border-border pl-2">{s.note}</div>
                )}
              </div>
              {s.status === "pending" && canEdit && (
                <Button size="sm" variant="outline" onClick={() => nudge(s.id)} disabled={nudging === s.id}>
                  <Bell className="h-3.5 w-3.5" /> {nudging === s.id ? "…" : "Nudge"}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
