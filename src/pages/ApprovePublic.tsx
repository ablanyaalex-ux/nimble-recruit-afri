import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, MapPin } from "lucide-react";

type Info = {
  ok: true;
  status: "waiting" | "pending" | "approved" | "rejected";
  decided_at: string | null;
  note: string | null;
  expired: boolean;
  step_order: number;
  approver_name: string;
  job: { id: string; title: string; description: string | null; location: string | null; employment_type: string | null; clients: { name: string } | null };
} | { error: string };

export default function ApprovePublic() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("process-automations", {
      body: { mode: "approval_info", token },
    });
    setInfo(data ?? { error: "Failed" });
    setLoading(false);
  };

  useEffect(() => { if (token) load(); }, [token]);

  const decide = async (decision: "approved" | "rejected") => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("process-automations", {
      body: { mode: "approval_decide", token, decision, note: decision === "rejected" ? note : null, publicUrl: window.location.origin },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) return;
    setDone(decision);
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!info || "error" in info) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl mb-2">Invalid or expired link</h1>
          <p className="text-sm text-muted-foreground">This approval link is no longer valid.</p>
        </div>
      </div>
    );
  }

  const i = info;
  const job = i.job;

  if (done || i.status === "approved" || i.status === "rejected") {
    const final = done ?? i.status;
    const Icon = final === "approved" ? CheckCircle2 : XCircle;
    const color = final === "approved" ? "text-emerald-600" : "text-destructive";
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <Card className="p-10 text-center max-w-md">
          <Icon className={`h-12 w-12 mx-auto mb-4 ${color}`} />
          <h1 className="font-display text-2xl mb-2">
            {final === "approved" ? "Approved" : "Rejected"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Thanks for your decision on <strong>{job.title}</strong>.
          </p>
        </Card>
      </div>
    );
  }

  if (i.expired) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <Card className="p-10 max-w-md">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display text-2xl mb-2">Link expired</h1>
          <p className="text-sm text-muted-foreground">Ask the recruiter to resend the approval request.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Approval requested</div>
          <Badge variant="outline">Step {i.step_order}</Badge>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{job.clients?.name}</div>
          <h1 className="font-display text-4xl mb-3">{job.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {job.location && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {job.location}</Badge>}
            {job.employment_type && <Badge variant="outline" className="capitalize">{job.employment_type.replace("_", " ")}</Badge>}
          </div>
        </div>

        <Card className="p-6">
          <h2 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-3">Job description</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {job.description ?? "No description provided."}
          </div>
        </Card>

        {!showReject ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1" onClick={() => decide("approved")} disabled={submitting}>
              <CheckCircle2 className="h-5 w-5" /> Approve
            </Button>
            <Button size="lg" variant="outline" className="flex-1" onClick={() => setShowReject(true)} disabled={submitting}>
              <XCircle className="h-5 w-5" /> Reject
            </Button>
          </div>
        ) : (
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-medium mb-1">Reject this job</h3>
              <p className="text-sm text-muted-foreground">Optionally tell the recruiter why.</p>
            </div>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for rejection (optional)" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowReject(false)} disabled={submitting}>Cancel</Button>
              <Button variant="destructive" onClick={() => decide("rejected")} disabled={submitting}>
                {submitting ? "Submitting…" : "Confirm reject"}
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
