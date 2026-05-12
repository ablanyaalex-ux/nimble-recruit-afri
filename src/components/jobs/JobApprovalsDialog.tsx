import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: {
    id: string;
    workspace_id: string;
    approval_status?: string;
    approved_by?: string | null;
    approval_requested_from?: string | null;
    approval_decided_at?: string | null;
    approval_note?: string | null;
  };
  onChanged: () => void;
};

type Owner = { user_id: string; profiles?: { display_name: string | null } | null };

export function JobApprovalsDialog({ open, onOpenChange, job, onChanged }: Props) {
  const { currentRole } = useWorkspace();
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [requestFrom, setRequestFrom] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState<{ name: string } | null>(null);
  const [approver, setApprover] = useState<{ name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u.user?.id ?? null);
      const { data } = await supabase
        .from("workspace_members")
        .select("user_id, role, profiles!inner(display_name)")
        .eq("workspace_id", job.workspace_id)
        .eq("role", "owner");
      const list = ((data ?? []) as any[]).map((r) => ({
        id: r.user_id,
        name: r.profiles?.display_name ?? "Owner",
      }));
      setOwners(list);

      if (job.approval_requested_from) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("id", job.approval_requested_from).maybeSingle();
        setReviewer(p ? { name: p.display_name ?? "Owner" } : null);
      }
      if (job.approved_by) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("id", job.approved_by).maybeSingle();
        setApprover(p ? { name: p.display_name ?? "Owner" } : null);
      }
    })();
  }, [open, job.workspace_id, job.approval_requested_from, job.approved_by]);

  const status = job.approval_status ?? "approved";
  const isOwner = currentRole === "owner";
  const isReviewer = me && job.approval_requested_from === me;

  const requestApproval = async () => {
    if (!requestFrom) return toast.error("Pick an owner");
    setBusy(true);
    const { error } = await supabase.from("jobs").update({
      approval_status: "pending",
      approval_requested_from: requestFrom,
      approval_decided_at: null,
      approved_by: null,
      approval_note: null,
    }).eq("id", job.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Approval requested");
    onChanged();
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!me) return;
    setBusy(true);
    const { error } = await supabase.from("jobs").update({
      approval_status: decision,
      approved_by: me,
      approval_decided_at: new Date().toISOString(),
      approval_note: note.trim() || null,
    }).eq("id", job.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Job approved" : "Job rejected");
    onChanged();
  };

  const setDraft = async () => {
    setBusy(true);
    const { error } = await supabase.from("jobs").update({
      approval_status: "draft",
      approval_requested_from: null,
      approved_by: null,
      approval_decided_at: null,
      approval_note: null,
    }).eq("id", job.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Reverted to draft");
    onChanged();
  };

  const statusBadge = () => {
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Clock className="h-3 w-3" /> Pending</Badge>;
    if (status === "rejected") return <Badge variant="destructive"><XCircle className="h-3 w-3" /> Rejected</Badge>;
    return <Badge variant="outline">Draft</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Approvals {statusBadge()}</DialogTitle>
          <DialogDescription>
            Jobs in <strong>draft</strong> or <strong>pending</strong> are hidden from the public careers page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(status === "approved" || status === "rejected") && (
            <div className="text-xs text-muted-foreground rounded-md border p-3 space-y-1">
              <div>
                {status === "approved" ? "Approved" : "Rejected"} by{" "}
                <span className="text-foreground font-medium">{approver?.name ?? "—"}</span>
                {job.approval_decided_at && <> on {new Date(job.approval_decided_at).toLocaleString()}</>}
              </div>
              {job.approval_note && <div className="italic">"{job.approval_note}"</div>}
            </div>
          )}

          {status === "pending" && (
            <div className="text-xs text-muted-foreground rounded-md border p-3">
              Awaiting decision from <span className="text-foreground font-medium">{reviewer?.name ?? "owner"}</span>.
            </div>
          )}

          {(status === "draft" || status === "rejected") && (
            <div className="space-y-2">
              <Label>Request approval from</Label>
              <Select value={requestFrom} onValueChange={setRequestFrom}>
                <SelectTrigger><SelectValue placeholder="Select an owner" /></SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={requestApproval} disabled={busy || !requestFrom}>
                <Send className="h-4 w-4" /> Request approval
              </Button>
            </div>
          )}

          {status === "pending" && (isOwner || isReviewer) && (
            <div className="space-y-2 border-t pt-4">
              <Label>Decision note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Reason for the decision…" />
              <div className="flex gap-2">
                <Button onClick={() => decide("approved")} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => decide("rejected")} disabled={busy}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          )}

          {status === "approved" && (
            <Button variant="ghost" size="sm" onClick={setDraft} disabled={busy}>
              Revert to draft
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
