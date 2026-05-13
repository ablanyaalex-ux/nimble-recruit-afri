import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Award, Send, Pencil, Copy, Check, Sparkles } from "lucide-react";
import { OfferDialog } from "./OfferDialog";
import { toast } from "sonner";

type Offer = {
  id: string;
  status: string;
  salary_amount: number | null;
  salary_currency: string | null;
  start_date: string | null;
  equity: string | null;
  bonus: string | null;
  notes: string | null;
  internal_approved_at: string | null;
  internal_approved_by: string | null;
  sent_at: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  public_token: string;
  created_at: string;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  internal_approval: { label: "Awaiting approval", variant: "secondary" },
  approved: { label: "Approved", variant: "secondary" },
  sent: { label: "Sent to candidate", variant: "default" },
  accepted: { label: "Accepted 🎉", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

export function OffersSection({
  workspaceId, jobId, jobCandidateId, candidateId, canEdit,
  onOfferAccepted,
}: {
  workspaceId: string;
  jobId: string;
  jobCandidateId: string;
  candidateId: string;
  canEdit: boolean;
  onOfferAccepted?: () => void;
}) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("offers")
      .select("*")
      .eq("job_candidate_id", jobCandidateId)
      .order("created_at", { ascending: false });
    setOffers((data ?? []) as Offer[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [jobCandidateId]);

  useEffect(() => {
    const ch = supabase
      .channel(`offers-${jobCandidateId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `job_candidate_id=eq.${jobCandidateId}` },
        (payload) => {
          if (payload.eventType === "UPDATE" && (payload.new as any).status === "accepted" && (payload.old as any)?.status !== "accepted") {
            onOfferAccepted?.();
          }
          refresh();
        }
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [jobCandidateId]);

  const approveOffer = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("offers").update({
      status: "approved",
      internal_approved_by: user.id,
      internal_approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Offer approved.");
  };

  const sendOffer = async (id: string) => {
    const { error } = await supabase.from("offers").update({
      status: "sent",
      sent_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Offer sent to candidate.");
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/offer/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Offer link copied.");
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-base flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" /> Offers ({offers.length})
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => { setEditId(null); setDialogOpen(true); }}>
            <Sparkles className="h-3.5 w-3.5" /> Generate offer
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No offers yet. Click <em>Generate offer</em> to start the closing flow.</p>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const badge = STATUS_BADGE[o.status] ?? { label: o.status, variant: "outline" as const };
            return (
              <div key={o.id} className="rounded-md border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {o.salary_amount != null && (
                      <span className="text-sm font-medium">
                        {o.salary_currency} {Number(o.salary_amount).toLocaleString()}
                      </span>
                    )}
                    {o.start_date && (
                      <span className="text-xs text-muted-foreground">
                        Starts {new Date(o.start_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && o.status === "draft" && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(o.id); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    {canEdit && o.status === "internal_approval" && (
                      <Button size="sm" variant="outline" onClick={() => approveOffer(o.id)}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                    )}
                    {canEdit && o.status === "approved" && (
                      <Button size="sm" onClick={() => sendOffer(o.id)}>
                        <Send className="h-3.5 w-3.5" /> Send to candidate
                      </Button>
                    )}
                    {(o.status === "sent" || o.status === "accepted" || o.status === "declined") && (
                      <Button size="sm" variant="ghost" onClick={() => copyLink(o.public_token)}>
                        <Copy className="h-3.5 w-3.5" /> Copy link
                      </Button>
                    )}
                  </div>
                </div>
                {(o.equity || o.bonus) && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                    {o.equity && <span><strong className="text-foreground">Equity:</strong> {o.equity}</span>}
                    {o.bonus && <span><strong className="text-foreground">Bonus:</strong> {o.bonus}</span>}
                  </div>
                )}
                {o.notes && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{o.notes}</p>}
                {o.status === "internal_approval" && canEdit && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                    <Checkbox id={`approve-${o.id}`} onCheckedChange={(v) => v && approveOffer(o.id)} />
                    <label htmlFor={`approve-${o.id}`}>I approve this offer for sending to the candidate.</label>
                  </div>
                )}
                {o.status === "declined" && o.decline_reason && (
                  <p className="text-xs text-destructive">Reason: {o.decline_reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <OfferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        jobId={jobId}
        jobCandidateId={jobCandidateId}
        candidateId={candidateId}
        existingOfferId={editId}
        onSaved={refresh}
      />
    </Card>
  );
}
