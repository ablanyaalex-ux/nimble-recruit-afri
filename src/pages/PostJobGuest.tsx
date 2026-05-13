import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Sparkles, CreditCard, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = ["Company", "Role", "Details", "Payment", "Done"] as const;
type Step = (typeof STEPS)[number];

const CATEGORIES = ["Engineering", "Product", "Design", "Sales", "Marketing", "Operations", "Finance", "People", "Other"];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];
const REMOTE = ["On-site", "Hybrid", "Remote"];

type State = {
  poster_name: string;
  poster_email: string;
  poster_company: string;
  poster_phone: string;
  title: string;
  category: string;
  employment_type: string;
  location: string;
  remote_policy: string;
  salary_min: string;
  salary_max: string;
  summary: string;
  description: string;
  apply_url: string;
};

const INITIAL: State = {
  poster_name: "", poster_email: "", poster_company: "", poster_phone: "",
  title: "", category: "Engineering", employment_type: "Full-time",
  location: "", remote_policy: "Remote",
  salary_min: "", salary_max: "",
  summary: "", description: "", apply_url: "",
};

export default function PostJobGuest() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("Company");
  const [s, setS] = useState<State>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const set = (k: keyof State) => (v: string) => setS((p) => ({ ...p, [k]: v }));

  function canNext(): boolean {
    if (step === "Company") return !!s.poster_name.trim() && /\S+@\S+\.\S+/.test(s.poster_email) && !!s.poster_company.trim();
    if (step === "Role") return !!s.title.trim() && !!s.category && !!s.employment_type;
    if (step === "Details") return !!s.summary.trim() && !!s.description.trim();
    return true;
  }

  async function handleSubmit() {
    setBusy(true);
    const { data, error } = await supabase
      .from("guest_job_submissions")
      .insert({
        poster_name: s.poster_name.trim(),
        poster_email: s.poster_email.trim(),
        poster_company: s.poster_company.trim(),
        poster_phone: s.poster_phone.trim() || null,
        title: s.title.trim(),
        category: s.category,
        employment_type: s.employment_type,
        location: s.location.trim() || null,
        remote_policy: s.remote_policy,
        salary_min: s.salary_min ? Number(s.salary_min) : null,
        salary_max: s.salary_max ? Number(s.salary_max) : null,
        summary: s.summary.trim(),
        description: s.description.trim(),
        apply_url: s.apply_url.trim() || null,
        status: "pending_review",
        payment_status: "stub_skipped",
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to submit");
      return;
    }
    setSubmissionId(data.id);
    setStep("Done");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/jobs" className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Talentboard</span>
          </Link>
          <Link to="/jobs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to marketplace
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">Post a job</h1>
          <p className="mt-2 text-muted-foreground">Reach thousands of qualified candidates in minutes.</p>
        </div>

        {/* Stepper */}
        <ol className="flex items-center gap-2 mb-8 justify-center text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-7 w-7 rounded-full grid place-items-center font-semibold border",
                  i < idx && "bg-primary text-primary-foreground border-primary",
                  i === idx && "border-primary text-primary",
                  i > idx && "border-border text-muted-foreground",
                )}
              >
                {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn(i === idx ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{label}</span>
              {i < STEPS.length - 1 && <span className="w-6 h-px bg-border" />}
            </li>
          ))}
        </ol>

        <Card className="p-6 md:p-8">
          {step === "Company" && (
            <div className="space-y-4">
              <h2 className="font-display text-xl">About you</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Your name *</Label>
                  <Input value={s.poster_name} onChange={(e) => set("poster_name")(e.target.value)} />
                </div>
                <div>
                  <Label>Work email *</Label>
                  <Input type="email" value={s.poster_email} onChange={(e) => set("poster_email")(e.target.value)} />
                </div>
                <div>
                  <Label>Company *</Label>
                  <Input value={s.poster_company} onChange={(e) => set("poster_company")(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={s.poster_phone} onChange={(e) => set("poster_phone")(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === "Role" && (
            <div className="space-y-4">
              <h2 className="font-display text-xl">The role</h2>
              <div>
                <Label>Job title *</Label>
                <Input value={s.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Senior Product Designer" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={s.category} onValueChange={set("category")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={s.employment_type} onValueChange={set("employment_type")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EMPLOYMENT_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Remote policy</Label>
                  <Select value={s.remote_policy} onValueChange={set("remote_policy")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{REMOTE.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <Label>Location</Label>
                  <Input value={s.location} onChange={(e) => set("location")(e.target.value)} placeholder="London, UK" />
                </div>
                <div>
                  <Label>Salary min</Label>
                  <Input type="number" value={s.salary_min} onChange={(e) => set("salary_min")(e.target.value)} />
                </div>
                <div>
                  <Label>Salary max</Label>
                  <Input type="number" value={s.salary_max} onChange={(e) => set("salary_max")(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === "Details" && (
            <div className="space-y-4">
              <h2 className="font-display text-xl">Description</h2>
              <div>
                <Label>One-line summary *</Label>
                <Input
                  value={s.summary}
                  maxLength={160}
                  onChange={(e) => set("summary")(e.target.value)}
                  placeholder="What makes this role exciting in one sentence?"
                />
                <p className="text-[11px] text-muted-foreground mt-1">{s.summary.length}/160</p>
              </div>
              <div>
                <Label>Full description *</Label>
                <Textarea
                  rows={10}
                  value={s.description}
                  onChange={(e) => set("description")(e.target.value)}
                  placeholder="Responsibilities, requirements, benefits..."
                />
              </div>
              <div>
                <Label>Apply URL (optional)</Label>
                <Input value={s.apply_url} onChange={(e) => set("apply_url")(e.target.value)} placeholder="https://..." />
                <p className="text-[11px] text-muted-foreground mt-1">If empty, candidates will apply via Talentboard.</p>
              </div>
            </div>
          )}

          {step === "Payment" && (
            <div className="space-y-5">
              <h2 className="font-display text-xl">Payment</h2>
              <div className="rounded-lg border-2 border-dashed border-border p-6 text-center bg-muted/30">
                <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium">Payment integration coming soon</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  We're finalising our billing partner. For now, your post will go through as a draft and our team will reach out to confirm.
                </p>
              </div>

              <Card className="p-4 bg-muted/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Standard listing
                    </div>
                    <div className="text-xs text-muted-foreground">30 days · Marketplace + email digest</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg">$199</div>
                    <Badge variant="secondary" className="text-[10px]">Stub</Badge>
                  </div>
                </div>
              </Card>

              <div className="text-xs text-muted-foreground">
                By continuing you agree to our terms. We'll email <span className="font-medium text-foreground">{s.poster_email || "you"}</span> with next steps.
              </div>
            </div>
          )}

          {step === "Done" && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="h-14 w-14 mx-auto text-primary" />
              <h2 className="font-display text-2xl">Submission received</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Thanks {s.poster_name.split(" ")[0] || "there"}! We've logged your job{" "}
                <span className="font-medium text-foreground">"{s.title}"</span>. Our team will review and reach out at{" "}
                <span className="font-medium text-foreground">{s.poster_email}</span> within 1 business day.
              </p>
              {submissionId && (
                <p className="text-[11px] text-muted-foreground font-mono">Reference: {submissionId.slice(0, 8)}</p>
              )}
              <div className="pt-4 flex gap-2 justify-center">
                <Button variant="outline" onClick={() => navigate("/jobs")}>Back to marketplace</Button>
                <Button
                  onClick={() => {
                    setS(INITIAL);
                    setSubmissionId(null);
                    setStep("Company");
                  }}
                >
                  Post another
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          {step !== "Done" && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => setStep(STEPS[Math.max(0, idx - 1)])}
                disabled={idx === 0}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              {step === "Payment" ? (
                <Button onClick={handleSubmit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Submit posting
                </Button>
              ) : (
                <Button
                  onClick={() => setStep(STEPS[idx + 1])}
                  disabled={!canNext()}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
