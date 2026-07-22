import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Award, Send, Pencil, Copy, Check, Sparkles, XCircle, Ban, Trash2, ExternalLink, CheckCircle2, FileDown, Mail } from "lucide-react";
import { OfferDialog } from "./OfferDialog";
import { SendEmailDialog } from "./SendEmailDialog";
import { downloadOfferPdf } from "@/lib/offerPdf";
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
  envelope_id: string | null;
  viewed_at: string | null;
  viewed_ip: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  signer_ua: string | null;
  signature_type: "typed" | "drawn" | null;
  signature_data: string | null;
  approval_feedback: string | null;
  approval_rejected_at: string | null;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  internal_approval: { label: "Pending approval", variant: "secondary" },
  approved: { label: "Approved — ready to send", variant: "secondary" },
  sent: { label: "Sent to candidate", variant: "default" },
  accepted: { label: "Accepted & signed 🎉", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

export function OffersSection({
  workspaceId, jobId, jobCandidateId, candidateId, canEdit,
  candidateName, candidateEmail, jobTitle, clientName, workspaceName,
  onOfferAccepted,
}: {
  workspaceId: string;
  jobId: string;
  jobCandidateId: string;
  candidateId: string;
  canEdit: boolean;
  candidateName?: string;
  candidateEmail?: string | null;
  jobTitle?: string;
  clientName?: string | null;
  workspaceName?: string | null;
  onOfferAccepted?: () => void;
}) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { type: "accept" | "decline" | "withdraw" | "delete"; offer: Offer }>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailOfferId, setEmailOfferId] = useState<string | null>(null);

  const publicUrlFor = (token: string) => `${window.location.origin}/offer/${token}`;

  const handleDownloadPdf = (o: Offer) => {
    downloadOfferPdf({
      candidateName: candidateName ?? "Candidate",
      candidateEmail,
      jobTitle: jobTitle ?? "Role",
      clientName,
      workspaceName,
      salary_amount: o.salary_amount,
      salary_currency: o.salary_currency,
      start_date: o.start_date,
      equity: o.equity,
      bonus: o.bonus,
      notes: o.notes,
      status: (STATUS_BADGE[o.status]?.label ?? o.status),
      sent_at: o.sent_at,
      decided_at: o.decided_at,
      publicUrl: ["approved", "sent", "accepted", "declined"].includes(o.status) ? publicUrlFor(o.public_token) : null,
    });
  };

  const emailOffer = offers.find((o) => o.id === emailOfferId) ?? null;

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
    toast.success("Offer approved. Ready to send.");
  };

  const sendOffer = async (id: string) => {
    const { error } = await supabase.from("offers").update({
      status: "sent",
      sent_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Offer sent to candidate.");
  };

  const moveToAcceptedStage = async () => {
    // Find a stage matching accepted/hired in this workspace and move the candidate
    const { data: stages } = await supabase
      .from("workspace_pipeline_stages")
      .select("key, label, position")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: false });
    const match = (stages ?? []).find((s: any) =>
      /accepted|hired|filled/i.test(s.key) || /accepted|hired|filled/i.test(s.label)
    );
    if (match) {
      await supabase.from("job_candidates").update({ stage: (match as any).key }).eq("id", jobCandidateId);
    }
  };

  const markAccepted = async (o: Offer) => {
    setBusy(true);
    const { error } = await supabase.from("offers").update({
      status: "accepted",
      decided_at: new Date().toISOString(),
      decline_reason: null,
    }).eq("id", o.id);
    if (!error) await moveToAcceptedStage();
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(error.message);
    toast.success("Marked as accepted. Candidate moved to Offer Accepted.");
  };

  const markDeclined = async (o: Offer) => {
    setBusy(true);
    const { error } = await supabase.from("offers").update({
      status: "declined",
      decided_at: new Date().toISOString(),
      decline_reason: reasonInput.trim() || null,
    }).eq("id", o.id);
    setBusy(false);
    setConfirm(null);
    setReasonInput("");
    if (error) return toast.error(error.message);
    toast.success("Marked as declined.");
  };

  const withdrawOffer = async (o: Offer) => {
    setBusy(true);
    const { error } = await supabase.from("offers").update({
      status: "withdrawn",
      decided_at: new Date().toISOString(),
      decline_reason: reasonInput.trim() || null,
    }).eq("id", o.id);
    setBusy(false);
    setConfirm(null);
    setReasonInput("");
    if (error) return toast.error(error.message);
    toast.success("Offer withdrawn.");
  };

  const deleteDraft = async (o: Offer) => {
    setBusy(true);
    const { error } = await supabase.from("offers").delete().eq("id", o.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(error.message);
    toast.success("Draft deleted.");
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/offer/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Offer link copied.");
  };

  const openLink = (token: string) => {
    const url = `${window.location.origin}/offer/${token}`;
    window.open(url, "_blank", "noopener");
  };

  const confirmTitle: Record<string, string> = {
    accept: "Mark offer as accepted?",
    decline: "Mark offer as declined?",
    withdraw: "Withdraw this offer?",
    delete: "Delete this draft?",
  };
  const confirmDesc: Record<string, string> = {
    accept: "This records the candidate's acceptance and moves them to the Offer Accepted stage.",
    decline: "This records the candidate's declination. The offer link will no longer be actionable.",
    withdraw: "The offer link becomes inactive and the candidate can no longer respond. You can generate a new offer afterwards.",
    delete: "Permanently remove this draft offer. This can't be undone.",
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
            const isPending = o.status === "sent";
            const isLive = ["approved", "sent"].includes(o.status);
            const isTerminal = ["accepted", "declined", "withdrawn"].includes(o.status);
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
                  <div className="flex items-center gap-1 flex-wrap">
                    {canEdit && o.status === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditId(o.id); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => setConfirm({ type: "delete", offer: o })}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </>
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
                    {(isLive || isTerminal) && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => copyLink(o.public_token)}>
                          <Copy className="h-3.5 w-3.5" /> Copy link
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openLink(o.public_token)}>
                          <ExternalLink className="h-3.5 w-3.5" /> Preview
                        </Button>
                        {canEdit && isLive && candidateEmail && (
                          <Button size="sm" variant="outline" onClick={() => setEmailOfferId(o.id)}>
                            <Mail className="h-3.5 w-3.5" /> Email offer
                          </Button>
                        )}
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDownloadPdf(o)}>
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                    {canEdit && isPending && (
                      <>
                        <Button size="sm" variant="outline" className="text-emerald-600 hover:text-emerald-700"
                          onClick={() => setConfirm({ type: "accept", offer: o })}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark accepted
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
                          onClick={() => setConfirm({ type: "decline", offer: o })}>
                          <XCircle className="h-3.5 w-3.5" /> Mark declined
                        </Button>
                      </>
                    )}
                    {canEdit && isLive && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setConfirm({ type: "withdraw", offer: o })}>
                        <Ban className="h-3.5 w-3.5" /> Withdraw
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
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                  {o.sent_at && <span>Sent {new Date(o.sent_at).toLocaleString()}</span>}
                  {o.decided_at && <span>Decided {new Date(o.decided_at).toLocaleString()}</span>}
                </div>
                {o.status === "internal_approval" && canEdit && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                    <Checkbox id={`approve-${o.id}`} onCheckedChange={(v) => v && approveOffer(o.id)} />
                    <label htmlFor={`approve-${o.id}`}>I approve this offer for sending to the candidate.</label>
                  </div>
                )}
                {(o.status === "declined" || o.status === "withdrawn") && o.decline_reason && (
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

      <AlertDialog open={!!confirm} onOpenChange={(v) => { if (!v) { setConfirm(null); setReasonInput(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? confirmTitle[confirm.type] : ""}</AlertDialogTitle>
            <AlertDialogDescription>{confirm ? confirmDesc[confirm.type] : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirm && (confirm.type === "decline" || confirm.type === "withdraw") && (() => {
            const trimmed = reasonInput.trim();
            const tooShort = trimmed.length > 0 && trimmed.length < 5;
            return (
              <div className="space-y-1">
                <Label className="text-xs">
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea rows={3} value={reasonInput} onChange={(e) => setReasonInput(e.target.value)}
                  maxLength={500}
                  aria-invalid={tooShort || trimmed.length === 0}
                  placeholder={confirm.type === "decline" ? "Why did the candidate decline?" : "Why is the offer being withdrawn?"} />
                <p className={`text-[11px] ${tooShort ? "text-destructive" : "text-muted-foreground"}`}>
                  {tooShort ? "Please provide at least 5 characters." : `${trimmed.length}/500 — required for the audit log.`}
                </p>
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                busy ||
                (confirm && (confirm.type === "decline" || confirm.type === "withdraw") && reasonInput.trim().length < 5)
              }
              onClick={(e) => {
                if (!confirm) return;
                if ((confirm.type === "decline" || confirm.type === "withdraw") && reasonInput.trim().length < 5) {
                  e.preventDefault();
                  toast.error("Please provide a reason (min. 5 characters).");
                  return;
                }
                if (confirm.type === "accept") markAccepted(confirm.offer);
                else if (confirm.type === "decline") markDeclined(confirm.offer);
                else if (confirm.type === "withdraw") withdrawOffer(confirm.offer);
                else if (confirm.type === "delete") deleteDraft(confirm.offer);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {emailOffer && candidateName && jobTitle && (
        <SendEmailDialog
          open={!!emailOfferId}
          onOpenChange={(v) => { if (!v) setEmailOfferId(null); }}
          workspaceId={workspaceId}
          candidateId={candidateId}
          jobCandidateId={jobCandidateId}
          candidateName={candidateName}
          candidateEmail={candidateEmail ?? null}
          jobTitle={jobTitle}
          offerLink={publicUrlFor(emailOffer.public_token)}
          defaultSubject={`Your offer for ${jobTitle}`}
          defaultBody={`Hi ${candidateName},\n\nWe're thrilled to extend you an offer for the ${jobTitle} role${clientName ? ` at ${clientName}` : ""}. You can review the full details and accept or decline securely here:\n\n${publicUrlFor(emailOffer.public_token)}\n\nAttached is a PDF copy of the offer for your records. Please reach out with any questions.\n\nBest,\nThe hiring team`}
          onSent={refresh}
        />
      )}
    </Card>
  );
}
