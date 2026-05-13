import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onCreated?: (jobId: string) => void;
};

type ClientOpt = { id: string; name: string };
type MemberOpt = { user_id: string; display_name: string; role: string };
type Question = {
  uid: string;
  question_text: string;
  type: "short_text" | "multiple_choice";
  options: string[];
  is_knockout: boolean;
  fail_values: string[];
};

type StdField = { enabled: boolean; required: boolean };
type FormConfig = {
  standard_fields: {
    full_name: StdField;
    email: StdField;
    phone: StdField;
    location: StdField;
    address: StdField;
  };
  allow_cv_parsing: boolean;
  require_cv: boolean;
};

const DEFAULT_FORM_CONFIG: FormConfig = {
  standard_fields: {
    full_name: { enabled: true, required: true },
    email: { enabled: true, required: true },
    phone: { enabled: true, required: false },
    location: { enabled: false, required: false },
    address: { enabled: false, required: false },
  },
  allow_cv_parsing: true,
  require_cv: false,
};

const STD_FIELD_LABELS: Record<keyof FormConfig["standard_fields"], string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  location: "Location (city / country)",
  address: "Full address",
};

const STEPS = ["Job Details", "Application Builder", "Approval Chain"] as const;

function newQuestion(): Question {
  return {
    uid: crypto.randomUUID(),
    question_text: "",
    type: "short_text",
    options: [],
    is_knockout: false,
    fail_values: [],
  };
}

export function JobWizardDialog({ open, onOpenChange, workspaceId, onCreated }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [clients, setClients] = useState<ClientOpt[]>([]);

  // Step 2
  const [questions, setQuestions] = useState<Question[]>([]);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);

  // Step 3
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [chain, setChain] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setTitle(""); setClientId(""); setDescription(""); setLocation(""); setEmploymentType("full_time");
    setQuestions([]); setChain([]); setFormConfig(DEFAULT_FORM_CONFIG);
    (async () => {
      const [cs, ms] = await Promise.all([
        supabase.from("clients").select("id, name").eq("workspace_id", workspaceId).order("name"),
        supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId).neq("role", "hiring_manager"),
      ]);
      setClients((cs.data ?? []) as ClientOpt[]);
      const ids = (ms.data ?? []).map((m) => m.user_id);
      const profs = ids.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs.data ?? []).map((p: any) => [p.id, p.display_name]));
      setMembers((ms.data ?? []).map((m: any) => ({
        user_id: m.user_id, role: m.role, display_name: map.get(m.user_id) ?? "Member",
      })));
    })();
  }, [open, workspaceId]);

  const canNext = useMemo(() => {
    if (step === 0) return title.trim() && clientId;
    return true;
  }, [step, title, clientId]);

  const updateQ = (uid: string, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q) => (q.uid === uid ? { ...q, ...patch } : q)));
  };
  const moveQ = (uid: string, dir: -1 | 1) => {
    setQuestions((qs) => {
      const i = qs.findIndex((q) => q.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const addToChain = (uid: string) => {
    if (!chain.includes(uid)) setChain([...chain, uid]);
  };
  const removeFromChain = (uid: string) => setChain(chain.filter((x) => x !== uid));
  const moveChain = (uid: string, dir: -1 | 1) => {
    const i = chain.indexOf(uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j], next[i]];
    setChain(next);
  };

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const hasChain = chain.length > 0;
      // Insert job
      const { data: job, error: jerr } = await supabase.from("jobs").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        employment_type: employmentType,
        status: hasChain ? "on_hold" : "open",
        approval_status: hasChain ? "pending" : "approved",
        application_form_config: formConfig as any,
        created_by: user.id,
      }).select("id").single();
      if (jerr || !job) throw new Error(jerr?.message ?? "Failed to create job");

      // Questions
      if (questions.length > 0) {
        const rows = questions
          .filter((q) => q.question_text.trim())
          .map((q, idx) => ({
            job_id: job.id,
            position: idx,
            question_text: q.question_text.trim(),
            options: q.type === "multiple_choice" ? q.options.filter((o) => o.trim()) : null,
            is_knockout: q.is_knockout,
            fail_value: q.is_knockout && q.fail_values.length ? q.fail_values.join(",") : null,
          }));
        if (rows.length) {
          const { error: qerr } = await supabase.from("job_application_questions").insert(rows);
          if (qerr) throw new Error(qerr.message);
        }
      }

      // Approval steps
      if (hasChain) {
        const stepsRows = chain.map((uid, idx) => ({
          job_id: job.id,
          approver_id: uid,
          step_order: idx + 1,
          status: "waiting",
        }));
        const { error: serr } = await supabase.from("job_approval_steps").insert(stepsRows);
        if (serr) throw new Error(serr.message);

        // Kick off the chain
        await supabase.functions.invoke("process-automations", {
          body: { mode: "approval_kickoff", jobId: job.id, publicUrl: window.location.origin },
        });
      }

      toast.success(hasChain ? "Job submitted for approval." : "Job created.");
      onCreated?.(job.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 py-2">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "h-7 w-7 rounded-full grid place-items-center text-xs font-medium border",
                idx < step && "bg-primary text-primary-foreground border-primary",
                idx === step && "border-primary text-primary",
                idx > step && "border-border text-muted-foreground",
              )}>
                {idx < step ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span className={cn("text-xs font-medium", idx === step ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
              {idx < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Backend Engineer" />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote / London" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={employmentType} onValueChange={setEmploymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="temp">Temp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Standard fields (name, email, phone) are always collected. Add custom questions below — mark any as knockout to auto-reject candidates choosing a "fail" answer.
            </p>
            {questions.map((q, idx) => (
              <Card key={q.uid} className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={q.question_text}
                      onChange={(e) => updateQ(q.uid, { question_text: e.target.value })}
                      placeholder="Question text"
                    />
                  </div>
                  <Select value={q.type} onValueChange={(v) => updateQ(q.uid, { type: v as any, options: v === "multiple_choice" ? q.options : [], fail_values: [] })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_text">Short text</SelectItem>
                      <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveQ(q.uid, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveQ(q.uid, 1)} disabled={idx === questions.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setQuestions((qs) => qs.filter((x) => x.uid !== q.uid))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {q.type === "multiple_choice" && (
                  <div className="space-y-2 pl-1">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Options</Label>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex gap-2 items-center">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...q.options];
                            next[oi] = e.target.value;
                            updateQ(q.uid, { options: next });
                          }}
                          placeholder={`Option ${oi + 1}`}
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => updateQ(q.uid, { options: q.options.filter((_, i) => i !== oi), fail_values: q.fail_values.filter((v) => v !== opt) })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => updateQ(q.uid, { options: [...q.options, ""] })}>
                      <Plus className="h-3 w-3" /> Add option
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Checkbox
                    id={`ko-${q.uid}`}
                    checked={q.is_knockout}
                    onCheckedChange={(v) => updateQ(q.uid, { is_knockout: !!v, fail_values: v ? q.fail_values : [] })}
                  />
                  <Label htmlFor={`ko-${q.uid}`} className="text-sm font-normal cursor-pointer">
                    Knockout question (auto-reject on fail answers)
                  </Label>
                </div>

                {q.is_knockout && q.type === "multiple_choice" && q.options.filter((o) => o.trim()).length > 0 && (
                  <div className="space-y-2 pl-1">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fail answers</Label>
                    <div className="flex flex-wrap gap-2">
                      {q.options.filter((o) => o.trim()).map((opt) => {
                        const checked = q.fail_values.includes(opt);
                        return (
                          <Badge
                            key={opt}
                            variant={checked ? "destructive" : "outline"}
                            className="cursor-pointer"
                            onClick={() => updateQ(q.uid, {
                              fail_values: checked ? q.fail_values.filter((v) => v !== opt) : [...q.fail_values, opt],
                            })}
                          >
                            {opt}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
                {q.is_knockout && q.type === "short_text" && (
                  <p className="text-xs text-muted-foreground">Knockout requires multiple-choice options. Switch the type above.</p>
                )}
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={() => setQuestions([...questions, newQuestion()])}>
              <Plus className="h-4 w-4" /> Add question
            </Button>
          </div>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add approvers in the order they should review. Each step is notified by email only after the previous one approves. Leave empty to publish immediately.
            </p>
            <div className="space-y-2">
              <Label>Add approver</Label>
              <Select value="" onValueChange={addToChain}>
                <SelectTrigger><SelectValue placeholder="Select team member…" /></SelectTrigger>
                <SelectContent>
                  {members.filter((m) => !chain.includes(m.user_id)).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name} <span className="text-muted-foreground text-xs">({m.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {chain.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No approvers yet. Job will be published immediately.
              </Card>
            ) : (
              <div className="space-y-2">
                {chain.map((uid, idx) => {
                  const m = members.find((x) => x.user_id === uid);
                  return (
                    <Card key={uid} className="p-3 flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">{idx + 1}</Badge>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m?.display_name ?? "Unknown"}</div>
                        <div className="text-xs text-muted-foreground capitalize">{m?.role}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveChain(uid, -1)} disabled={idx === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveChain(uid, 1)} disabled={idx === chain.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeFromChain(uid)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !title.trim() || !clientId}>
              {submitting ? "Creating…" : chain.length ? "Submit for approval" : "Publish job"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
