import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, CheckCircle2, XCircle, Calendar, Banknote, Briefcase, FileDown, PenTool } from "lucide-react";
import { toast } from "sonner";
import { SignatureDialog } from "@/components/offers/SignatureDialog";
import { downloadOfferPdf } from "@/lib/offerPdf";

type Offer = {
  id: string;
  status: string;
  salary_amount: number | null;
  salary_currency: string | null;
  start_date: string | null;
  equity: string | null;
  bonus: string | null;
  notes: string | null;
  sent_at: string | null;
  decided_at: string | null;
  candidate_name: string;
  candidate_email: string | null;
  job_title: string;
  client_name: string;
  workspace_name: string;
  envelope_id: string;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  signer_ua: string | null;
  signature_type: "typed" | "drawn" | null;
  signature_data: string | null;
  internal_approved_at: string | null;
  created_at: string;
  recruiter_name: string | null;
};

export default function OfferPublic() {
  const { token } = useParams<{ token: string }>();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [celebrate, setCelebrate] = useState(false);

  const DECLINE_REASONS = ["Compensation", "Counter-offer accepted", "Role/scope not right", "Location / relocation", "Timing", "Other"];

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_offer_by_token", { _token: token });
    setLoading(false);
    if (error) return toast.error(error.message);
    const row = (data as any)?.[0] ?? null;
    setOffer(row);
  };

  const getIp = async (): Promise<string | null> => {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json();
      return j.ip ?? null;
    } catch { return null; }
  };

  useEffect(() => {
    (async () => {
      await load();
      if (token) {
        const ip = await getIp();
        await supabase.rpc("record_offer_view", { _token: token, _ip: ip });
      }
    })();
    // eslint-disable-next-line
  }, [token]);

  const decline = async () => {
    if (!token) return;
    if (!reasonCategory) { toast.error("Please choose a reason."); return; }
    if (reasonCategory === "Other" && reason.trim().length < 5) {
      toast.error("Please tell us a little more (5+ characters).");
      return;
    }
    const detail = reason.trim();
    const composed = detail ? `${reasonCategory} — ${detail}` : reasonCategory;
    setSubmitting(true);
    const { error } = await supabase.rpc("respond_offer", { _token: token, _accept: false, _reason: composed });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Response submitted.");
    load();
  };


  const sign = async (payload: { type: "typed" | "drawn"; data: string; signerName: string }): Promise<void> => {
    if (!token) return;
    setSubmitting(true);
    const ip = await getIp();
    const ua = navigator.userAgent;
    const { error } = await supabase.rpc("sign_offer", {
      _token: token,
      _signer_name: payload.signerName,
      _signature_type: payload.type,
      _signature_data: payload.data,
      _signer_ip: ip,
      _signer_ua: ua,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setSignOpen(false);
    setCelebrate(true);
    toast.success("Offer signed and accepted!");
    load();
  };

  const buildPdfInput = (o: Offer) => ({
    candidateName: o.candidate_name,
    candidateEmail: o.candidate_email,
    jobTitle: o.job_title,
    clientName: o.client_name,
    workspaceName: o.workspace_name,
    recruiterName: o.recruiter_name,
    salary_amount: o.salary_amount,
    salary_currency: o.salary_currency,
    start_date: o.start_date,
    equity: o.equity,
    bonus: o.bonus,
    notes: o.notes,
    status: o.status,
    sent_at: o.sent_at,
    decided_at: o.decided_at,
    envelopeId: o.envelope_id,
    createdAt: o.created_at,
    approvedAt: o.internal_approved_at,
    viewedAt: o.viewed_at,
    signature: o.signature_data && o.signature_type ? {
      type: o.signature_type,
      data: o.signature_data,
      signedAt: o.signed_at ?? o.decided_at ?? new Date().toISOString(),
      signerName: o.signer_name ?? o.candidate_name,
      signerEmail: o.candidate_email,
      signerIp: o.signer_ip,
      signerUa: o.signer_ua,
    } : null,
  });

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-muted/30">
      <p className="text-sm text-muted-foreground">Loading your offer…</p>
    </div>;
  }

  if (!offer) {
    return <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-muted/30 p-6">
      <Card className="p-8 max-w-md text-center">
        <p className="font-display text-2xl mb-2">Offer not available</p>
        <p className="text-sm text-muted-foreground">This offer link is invalid or has been withdrawn.</p>
      </Card>
    </div>;
  }

  const signed = offer.status === "accepted" && !!offer.signed_at;
  const decided = offer.status === "accepted" || offer.status === "declined";

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-muted/40 p-4 md:p-10 relative overflow-hidden">
      {celebrate && <Confetti />}
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Official offer
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">An offer for {offer.candidate_name}</h1>
          <p className="text-muted-foreground mt-2">
            {offer.job_title} · {offer.client_name}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">Envelope ID: {offer.envelope_id}</p>
        </div>

        {signed && (
          <Card className="p-4 mb-4 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              <div>
                <p className="font-medium">Offer signed successfully.</p>
                <p className="text-xs opacity-80">A copy with your signature and audit certificate is available below.</p>
              </div>
            </div>
            <Button onClick={() => downloadOfferPdf(buildPdfInput(offer))}>
              <FileDown className="h-4 w-4" /> Download signed PDF
            </Button>
          </Card>
        )}

        <Card className="p-8 shadow-2xl border-primary/10">
          <div className="grid sm:grid-cols-2 gap-6 mb-6">
            <Field icon={<Banknote className="h-4 w-4" />} label="Compensation"
              value={offer.salary_amount != null ? `${offer.salary_currency} ${Number(offer.salary_amount).toLocaleString()}` : "—"} />
            <Field icon={<Calendar className="h-4 w-4" />} label="Start date"
              value={offer.start_date ? new Date(offer.start_date).toLocaleDateString(undefined, { dateStyle: "long" }) : "To be confirmed"} />
            <Field icon={<Briefcase className="h-4 w-4" />} label="Equity" value={offer.equity ?? "—"} />
            <Field icon={<Sparkles className="h-4 w-4" />} label="Bonus" value={offer.bonus ?? "—"} />
          </div>

          {offer.notes && (
            <div className="rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap leading-relaxed mb-6">
              {offer.notes}
            </div>
          )}

          {!decided && (
            <div className="flex justify-center mb-4">
              <Button variant="ghost" size="sm" onClick={() => downloadOfferPdf(buildPdfInput(offer))}>
                <FileDown className="h-4 w-4" /> Download unsigned draft PDF
              </Button>
            </div>
          )}

          {decided ? (
            <div className="text-center py-4">
              {offer.status === "accepted" ? (
                <Badge variant="default" className="text-base px-4 py-1.5">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> You accepted this offer
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-base px-4 py-1.5">
                  <XCircle className="h-4 w-4 mr-1" /> You declined this offer
                </Badge>
              )}
              {offer.decided_at && (
                <p className="text-xs text-muted-foreground mt-2">on {new Date(offer.decided_at).toLocaleString()}</p>
              )}
            </div>
          ) : showDecline ? (
            <div className="space-y-3">
              <Label className="text-sm">Reason (optional)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Help us improve…" />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowDecline(false)} disabled={submitting}>Back</Button>
                <Button variant="destructive" onClick={decline} disabled={submitting}>Confirm decline</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="flex-1 sm:flex-none sm:px-12" onClick={() => setSignOpen(true)} disabled={submitting}>
                <PenTool className="h-5 w-5" /> Sign & accept
              </Button>
              <Button size="lg" variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowDecline(true)} disabled={submitting}>
                <XCircle className="h-5 w-5" /> Decline
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          This is a secure offer link. Please contact your recruiter with any questions.
        </p>
      </div>

      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={offer.candidate_name}
        onSign={sign}
        submitting={submitting}
      />
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}<span>{label}</span>
      </div>
      <div className="font-display text-xl">{value}</div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 80 });
  const colors = ["bg-primary", "bg-emerald-500", "bg-amber-500", "bg-sky-500", "bg-pink-500"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 2 + Math.random() * 2;
        const color = colors[i % colors.length];
        return (
          <span
            key={i}
            className={`absolute top-0 h-2 w-2 rounded-sm ${color} animate-confetti`}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}
